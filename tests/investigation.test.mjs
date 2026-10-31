import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  validateInvestigation,
  investigate,
} from "../netlify/functions/lib/investigation.js";
import { createInvestigationHandler } from "../netlify/functions/investigate.js";
let db, rid;
const farmer = "00000000-0000-4000-8000-000000000001",
  officer = "00000000-0000-4000-8000-000000000002",
  other = "00000000-0000-4000-8000-000000000003";
const cid = "20000000-0000-4000-8000-000000000001";
const sid = (id) => "10000000" + id.slice(8);
const uid = () => crypto.randomUUID();
async function as(id) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: id, session_id: sid(id), aal: "aal1" }),
  ]);
  await db.exec("set role authenticated");
}
async function action(name, body = {}, id = rid) {
  return (
    await db.query("select public.farmrelay_investigation($1,$2,$3) as data", [
      id,
      name,
      JSON.stringify(body),
    ])
  ).rows[0].data;
}
async function start(kind = "investigate") {
  return (
    await db.query("select public.farmrelay_start_analysis($1,$2) as data", [
      rid,
      kind,
    ])
  ).rows[0].data;
}
async function finish(id, result) {
  await db.exec("reset role;set role service_role");
  await db.query("select public.farmrelay_finish_analysis($1,$2,null)", [
    id,
    JSON.stringify(result),
  ]);
}
before(async () => {
  db = new PGlite();
  await db.exec(
    await readFile(
      new URL("../supabase/tests/platform.sql", import.meta.url),
      "utf8",
    ),
  );
  for (const f of (
    await readdir(new URL("../supabase/migrations/", import.meta.url))
  ).sort())
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/" + f, import.meta.url),
        "utf8",
      ),
    );
  for (const id of [farmer, officer, other]) {
    await db.query(
      'insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values($1,$2,\'{"name":"Test farmer"}\',now())',
      [id, id + "@example.test"],
    );
    await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [
      sid(id),
      id,
    ]);
  }
  await db.query("update public.profiles set role='officer' where id=$1", [
    officer,
  ]);
  await as(farmer);
  const res = await db.query(
    "select public.farmrelay_api('/reports','POST',$1,'{}') as data",
    [
      JSON.stringify({
        clientId: cid,
        crop: "Maize",
        community: "Test community",
        symptom: "Leaf damage",
        onset: "2026-01-01",
        description: "Leaves have holes.",
      }),
    ],
  );
  rid = res.rows[0].data.report._id;
  await db.exec("reset role");
  await db.query("update public.reports set assigned_to=$1 where id=$2", [
    officer,
    rid,
  ]);
});
after(() => db.close());
test("case permissions deny other farmers, unassigned officers and direct mutation", async () => {
  await as(other);
  await assert.rejects(() => action("get"), /unavailable/);
  assert.equal(
    (await db.query("select * from public.case_events")).rows.length,
    0,
  );
  await as(farmer);
  await assert.rejects(
    () =>
      db.query(
        "insert into public.case_events(report_id,client_id,actor,actor_name,kind) values($1,$2,$3,'spoof','advice')",
        [rid, uid(), farmer],
      ),
    /permission denied/,
  );
  await assert.rejects(
    () => action("advice", { clientId: uid(), version: 0, text: "spoof" }),
    /Staff/,
  );
});
test("evidence validates ownership and retries atomically without duplication", async () => {
  await as(farmer);
  const path = `${farmer}/${cid}/${uid()}/photo`;
  await db.query(
    'insert into storage.objects(bucket_id,name,metadata) values(\'crop-evidence\',$1,\'{"size":100,"mimetype":"image/jpeg"}\')',
    [path],
  );
  const body = {
    clientId: uid(),
    items: [
      {
        clientId: uid(),
        kind: "photo",
        label: "Whole plant",
        media: { path, bytes: 100, mime: "image/jpeg" },
      },
    ],
  };
  const first = await action("evidence", body);
  assert.equal(first.evidence.length, 1);
  assert.equal((await action("evidence", body)).evidence.length, 1);
  await assert.rejects(
    () =>
      action("evidence", {
        ...body,
        clientId: uid(),
        items: [
          {
            ...body.items[0],
            clientId: uid(),
            media: {
              path: path.replace(farmer, other),
              bytes: 100,
              mime: "image/jpeg",
            },
          },
        ],
      }),
    /metadata/,
  );
  await db.query("delete from storage.objects where name=$1", [path]);
  assert.equal(
    (await db.query("select * from storage.objects where name=$1", [path])).rows
      .length,
    1,
  );
  await as(officer);
  assert.equal(
    (await db.query("select * from storage.objects where name=$1", [path])).rows
      .length,
    1,
  );
});
test("answers are bounded and invalidate earlier evidence versions", async () => {
  await as(farmer);
  const old = (await action("get")).report.evidenceVersion;
  await action("answers", {
    clientId: uid(),
    answers: { insects: "Not sure" },
  });
  assert.equal((await action("get")).report.evidenceVersion, old + 1);
  await assert.rejects(
    () => action("answers", { clientId: uid(), answers: { role: "admin" } }),
    /Unsupported/,
  );
  await assert.rejects(
    () =>
      action("answers", {
        clientId: uid(),
        answers: { insects: { attack: true } },
      }),
    /short text/,
  );
});
test("reviewed advice uses optimistic concurrency and delivers a notification", async () => {
  await as(officer);
  const r = (await action("get")).report;
  const due = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const body = {
    clientId: uid(),
    version: r.version,
    text: "Please provide a wider photograph for review.",
    due,
  };
  await action("advice", body);
  await action("advice", body);
  await assert.rejects(
    () => action("advice", { ...body, clientId: uid() }),
    /CONFLICT/,
  );
  await as(farmer);
  const s = await action("get");
  assert.equal(s.report.followupDue, due);
  assert.equal(s.events.filter((e) => e.kind === "advice").length, 1);
  assert.ok((await db.query("select * from public.notifications")).rows.length);
  await action("followup", {
    clientId: uid(),
    text: "No visible change yet.",
    outcome: "Unchanged",
  });
  assert.equal((await action("get")).report.status, "Needs review");
});
test("paid AI starts are deduplicated and output becomes superseded after new evidence", async () => {
  await as(officer);
  const run = await start();
  await assert.rejects(() => start(), /PROCESSING/);
  await as(farmer);
  await assert.rejects(() => start(), /staff/);
  await action("answers", {
    clientId: uid(),
    answers: { extent: "Several plants" },
  });
  await finish(run.run.id, { model: "test", brief: { summary: "test" } });
  await as(officer);
  assert.equal((await action("get")).runs[0].state, "superseded");
  const fresh = await start();
  await finish(fresh.run.id, { model: "test", brief: { summary: "fresh" } });
  await as(officer);
  assert.equal((await start()).cached, true);
});
test("AI persistence is server-only and rejects changed assignment", async () => {
  await as(officer);
  await assert.rejects(
    () =>
      db.query("select public.farmrelay_finish_analysis($1,$2,null)", [
        uid(),
        "{}",
      ]),
    /permission denied/,
  );
  const run = await start("segment");
  await db.exec("reset role");
  await db.query("update public.reports set assigned_to=null where id=$1", [
    rid,
  ]);
  await finish(run.run.id, { boxes: [] });
  await db.exec("reset role");
  assert.equal(
    (
      await db.query("select state from public.ai_runs where id=$1", [
        run.run.id,
      ])
    ).rows[0].state,
    "failed",
  );
});
const brief = {
  summary: "Observation",
  reported: [{ text: "Farmer reports damage.", evidenceIds: ["report"] }],
  visible: [],
  possibilities: [],
  unknowns: ["Cause unknown"],
  questions: [
    { key: "insects", question: "Any insects?", reason: "Additional context" },
  ],
  referenceIds: ["fao-faw"],
};
test("AI schema rejects invented evidence, references and duplicate questions", () => {
  assert.equal(validateInvestigation(brief, []).summary, "Observation");
  assert.throws(() =>
    validateInvestigation(
      { ...brief, visible: [{ text: "Something", evidenceIds: ["made-up"] }] },
      [],
    ),
  );
  assert.throws(() =>
    validateInvestigation({ ...brief, referenceIds: ["fake-reference"] }, []),
  );
  assert.throws(() =>
    validateInvestigation(
      { ...brief, questions: [brief.questions[0], brief.questions[0]] },
      [],
    ),
  );
});
test("AI questioning removes answered fields and whole-plant requests", async () => {
  const result = await investigate(
    {
      report: { answers: { insects: "None" }, evidenceVersion: 3 },
      evidence: [],
    },
    { MODEL_API_KEY: "test" },
    async () => Response.json({ output_text: JSON.stringify(brief) }),
  );
  assert.equal(result.brief.questions.length, 0);
  assert.equal(result.evidenceVersion, 3);
});
test("analysis endpoint rejects unauthorised calls before any paid request", async () => {
  let paid = false;
  const handler = createInvestigationHandler({
    env: {
      APP_ORIGIN: "https://example.test",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "public",
      SUPABASE_SECRET_KEY: "secret",
      MODEL_API_KEY: "meta",
    },
    clientFactory: () => ({
      rpc: async () => ({ error: { message: "denied" } }),
    }),
    fetcher: async () => {
      paid = true;
    },
  });
  const res = await handler(
    new Request("https://example.test/.netlify/functions/investigate", {
      method: "POST",
      headers: {
        Origin: "https://example.test",
        Authorization: "Bearer token",
        "X-Report-Id": farmer,
        "X-AI-Action": "guide",
      },
    }),
  );
  assert.equal(res.status, 403);
  assert.equal(paid, false);
});
test("server-side queues retain role scope and expose status events without internal session fields", async () => {
  await as(farmer);
  const list = (
    await db.query(
      "select public.farmrelay_api('/reports','GET','{}','{\"queue\":\"unassigned\"}') as data",
    )
  ).rows[0].data;
  assert.equal(list.total, 1);
  assert.equal(list.items[0]._id, rid);
  const snap = await action("get");
  assert.ok(snap.events.some((e) => e.body.statusChange));
  assert.ok(
    snap.runs.every((r) => !("session_id" in r) && !("access_version" in r)),
  );
  await as(other);
  assert.equal(
    (
      await db.query(
        "select public.farmrelay_api('/reports','GET','{}','{\"queue\":\"unassigned\"}') as data",
      )
    ).rows[0].data.total,
    0,
  );
});
function endpointFixture({
  state = "complete",
  upstreamOk = true,
  saveRejects = false,
} = {}) {
  let paid = 0;
  const saves = [];
  const result = { brief };
  const db = {
    rpc: async () => ({
      data: {
        cached: false,
        run: { id: uid() },
        case: { report: { answers: {}, evidenceVersion: 1 }, evidence: [] },
      },
    }),
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { state, result } }) }),
      }),
    }),
  };
  const service = {
    rpc: (name, args) => ({
      // Match the real SDK builder: thenable, without a .catch method.
      then(resolve, reject) {
        saves.push(args);
        return (
          saveRejects
            ? Promise.reject(Error("Persistence unavailable"))
            : Promise.resolve({ data: null })
        ).then(resolve, reject);
      },
    }),
  };
  const handler = createInvestigationHandler({
    env: {
      APP_ORIGIN: "https://example.test",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "public",
      SUPABASE_SECRET_KEY: "secret",
      MODEL_API_KEY: "meta",
    },
    clientFactory: (_url, key) => (key === "secret" ? service : db),
    fetcher: async () => {
      paid++;
      return upstreamOk
        ? Response.json({ output_text: JSON.stringify(brief) })
        : new Response("", { status: 503 });
    },
  });
  const request = () =>
    new Request("https://example.test/.netlify/functions/investigate", {
      method: "POST",
      headers: {
        Origin: "https://example.test",
        Authorization: "Bearer token",
        "X-Report-Id": farmer,
        "X-AI-Action": "guide",
      },
    });
  return {
    handler,
    request,
    saves,
    get paid() {
      return paid;
    },
  };
}
test("analysis saves structured output server-side and detects superseded results", async () => {
  const ok = endpointFixture();
  const res = await ok.handler(ok.request());
  assert.equal(res.status, 200);
  assert.equal(ok.paid, 1);
  assert.equal(ok.saves[0].p_result.brief.summary, "Observation");
  assert.equal(ok.saves[0].p_error, null);
  const stale = endpointFixture({ state: "superseded" });
  assert.equal((await stale.handler(stale.request())).status, 409);
});
test("upstream failures record a retryable failed run without invented output", async () => {
  const f = endpointFixture({ upstreamOk: false });
  assert.equal((await f.handler(f.request())).status, 502);
  assert.equal(f.saves[0].p_result, null);
  assert.match(f.saves[0].p_error, /Retry/);
});

test("cached analysis never exposes stored session or access-version fields", async () => {
  await db.exec("reset role");
  await db.query("update public.reports set assigned_to=$1 where id=$2", [
    officer,
    rid,
  ]);
  await as(officer);
  const run = await start("segment");
  assert.ok(!("session_id" in run.run));
  await finish(run.run.id, { boxes: [] });
  await as(officer);
  const cached = await start("segment");
  assert.equal(cached.cached, true);
  assert.ok(!("session_id" in cached.run));
  assert.ok(!("access_version" in cached.run));
});
test("visible claims require photos actually sent to the model", () => {
  assert.throws(
    () =>
      validateInvestigation(
        { ...brief, visible: [{ text: "Visible claim", evidenceIds: ["p1"] }] },
        ["p1"],
        [],
      ),
    /supplied photos/,
  );
  assert.throws(
    () =>
      validateInvestigation(
        {
          ...brief,
          visible: [{ text: "Visible claim", evidenceIds: ["report"] }],
        },
        [],
        [],
      ),
    /supplied photos/,
  );
});

test("AI failure cleanup accepts SDK thenables and preserves the original error even if persistence rejects", async () => {
  const f = endpointFixture({ upstreamOk: false, saveRejects: true });
  const response = await f.handler(f.request());
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.match(body.error, /Meta.*HTTP 503/);
  assert.equal(body.errorType, undefined);
  assert.equal(f.saves[0].p_result, null);
});
