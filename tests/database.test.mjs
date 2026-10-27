import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
let db;
const ids = {
  farmer: "00000000-0000-4000-8000-000000000001",
  other: "00000000-0000-4000-8000-000000000002",
  officer: "00000000-0000-4000-8000-000000000003",
  admin: "00000000-0000-4000-8000-000000000004",
};
const sid = (id) => "10000000" + id.slice(8);
async function as(who, aal = "aal1") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: ids[who], session_id: sid(ids[who]), aal }),
  ]);
  await db.exec("set role authenticated");
}
async function rpc(path, method = "GET", body = {}, query = {}) {
  return (
    await db.query(
      "select public.farmrelay_api($1,$2,$3::jsonb,$4::jsonb) as result",
      [path, method, JSON.stringify(body), JSON.stringify(query)],
    )
  ).rows[0].result;
}
before(async () => {
  db = new PGlite();
  await db.exec(
    await readFile(
      new URL("../supabase/tests/platform.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202610270001_farmrelay.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const [name, id] of Object.entries(ids)) {
    await db.query(
      "insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values($1,$2,$3,now())",
      [
        id,
        name + "@example.test",
        JSON.stringify({ name: "QA " + name, role: "admin" }),
      ],
    );
    await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [
      sid(id),
      id,
    ]);
  }
  await db.query("update public.profiles set role='officer' where id=$1", [
    ids.officer,
  ]);
  await db.query("update public.profiles set role='admin' where id=$1", [
    ids.admin,
  ]);
});
after(async () => {
  await db?.close();
});
let report;
test("registration ignores injected role metadata and profile writes cannot promote users", async () => {
  await as("farmer");
  assert.equal((await rpc("/auth/me")).user.role, "farmer");
  await assert.rejects(() =>
    rpc("/auth/profile", "PATCH", {
      name: "Malicious",
      role: "admin",
      community: "",
    }),
  );
  await assert.rejects(
    () =>
      db.query("update public.profiles set role='admin' where id=$1", [
        ids.farmer,
      ]),
    /permission denied/,
  );
});
test("report creation is idempotent, role scoped and rejects spoofed ownership", async () => {
  await as("farmer");
  const payload = {
    clientId: "20000000-0000-4000-8000-000000000001",
    crop: "Maize",
    community: "QA village",
    symptom: "Leaf damage",
    onset: "2026-01-01",
    description: "Several leaves have holes.",
  };
  await assert.rejects(() =>
    rpc("/reports", "POST", { ...payload, owner: ids.other }),
  );
  report = (await rpc("/reports", "POST", payload)).report;
  assert.equal((await rpc("/reports", "POST", payload)).report._id, report._id);
  await as("other");
  assert.equal((await rpc("/reports")).total, 0);
  await assert.rejects(() => rpc("/reports/" + report._id), /NOT_FOUND/);
  assert.equal((await db.query("select * from public.reports")).rows.length, 0);
  await as("officer");
  assert.equal((await rpc("/reports")).total, 0);
});
test("administrators require an aal2 session, then can assign an officer", async () => {
  await as("admin");
  await assert.rejects(() => rpc("/admin/users"), /MFA_OR_VERIFICATION/);
  await as("admin", "aal2");
  assert.equal((await rpc("/admin/users")).total, 4);
  await rpc("/reports/" + report._id + "/assignment", "PATCH", {
    officerId: ids.officer,
    version: 0,
  });
  await as("officer");
  assert.equal((await rpc("/reports")).total, 1);
  await rpc("/reports/" + report._id, "PATCH", {
    version: 1,
    status: "In review",
    priority: "high",
  });
  await assert.rejects(
    () =>
      rpc("/reports/" + report._id, "PATCH", {
        version: 1,
        status: "Closed",
        priority: "normal",
      }),
    /CONFLICT/,
  );
});
test("messages and notifications are transactional and cannot spoof the author", async () => {
  await as("officer");
  const body = {
    clientId: "30000000-0000-4000-8000-000000000001",
    text: "Please check the underside of the leaf.",
  };
  await assert.rejects(() =>
    rpc("/reports/" + report._id + "/messages", "POST", {
      ...body,
      role: "admin",
    }),
  );
  await rpc("/reports/" + report._id + "/messages", "POST", body);
  await rpc("/reports/" + report._id + "/messages", "POST", body);
  await as("farmer");
  const m = await rpc("/reports/" + report._id + "/messages");
  assert.equal(m.total, 1);
  assert.equal(m.items[0].role, "officer");
  assert.ok((await rpc("/notifications")).unread > 0);
  await as("other");
  assert.equal((await rpc("/notifications")).items.length, 0);
});
test("private storage denies cross-account and unassigned reads and media ownership spoofing", async () => {
  await as("farmer");
  const path =
    ids.farmer +
    "/20000000-0000-4000-8000-000000000002/40000000-0000-4000-8000-000000000001/photo";
  await db.query(
    "insert into storage.objects(bucket_id,name,metadata) values('crop-evidence',$1,$2)",
    [path, JSON.stringify({ size: 100, mimetype: "image/jpeg" })],
  );
  await as("other");
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    0,
  );
  await assert.rejects(
    () =>
      rpc("/reports", "POST", {
        clientId: "20000000-0000-4000-8000-000000000002",
        crop: "Maize",
        community: "QA town",
        symptom: "Wilting",
        onset: "2026-01-01",
        description: "Wilting noted.",
        photo: { path, bytes: 100, mime: "image/jpeg" },
      }),
    /metadata/,
  );
  await assert.rejects(
    () =>
      db.query(
        "insert into storage.objects(bucket_id,name,metadata) values('crop-evidence',$1,'{}')",
        [path],
      ),
    /row-level security/,
  );
});
test("committed attachments cannot be deleted by the farmer, even after a role change", async () => {
  await as("farmer");
  const path =
    ids.farmer +
    "/20000000-0000-4000-8000-000000000002/40000000-0000-4000-8000-000000000001/photo";
  const created = await rpc("/reports", "POST", {
    clientId: "20000000-0000-4000-8000-000000000002",
    crop: "Maize",
    community: "QA village",
    symptom: "Wilting",
    onset: "2026-01-01",
    description: "Wilting noted.",
    photo: { path, bytes: 100, mime: "image/jpeg" },
  });
  assert.ok(created.report._id);
  await db.query("delete from storage.objects where name=$1", [path]);
  assert.equal(
    (await db.query("select * from storage.objects where name=$1", [path])).rows
      .length,
    1,
  );
  await db.exec("reset role");
  await db.query("update public.profiles set role='officer' where id=$1", [
    ids.farmer,
  ]);
  await as("farmer");
  await db.query("delete from storage.objects where name=$1", [path]);
  await db.exec("reset role");
  assert.equal(
    (await db.query("select * from storage.objects where name=$1", [path])).rows
      .length,
    1,
  );
  await db.query("update public.profiles set role='farmer' where id=$1", [
    ids.farmer,
  ]);
});
test("AI writes are service-only and stale staff permissions block persistence", async () => {
  await as("officer");
  const context = (
    await db.query("select public.farmrelay_ai_context($1) as c", [report._id])
  ).rows[0].c;
  await assert.rejects(
    () =>
      db.query("select public.farmrelay_save_ai($1,$2,$3,0,'brief','{}')", [
        report._id,
        ids.officer,
        sid(ids.officer),
      ]),
    /permission denied/,
  );
  await as("admin", "aal2");
  await rpc("/admin/users/" + ids.officer, "PATCH", {
    role: "officer",
    active: false,
  });
  await as("officer");
  await assert.rejects(() => rpc("/auth/me"), /AUTH_REQUIRED/);
  await db.exec("reset role;set role service_role");
  await assert.rejects(
    () =>
      db.query("select public.farmrelay_save_ai($1,$2,$3,$4,'brief','{}')", [
        report._id,
        ids.officer,
        sid(ids.officer),
        context.accessVersion,
      ]),
    /Access changed/,
  );
});
test("enrolled MFA is enforced by RLS and app logout revokes retained tokens", async () => {
  await db.exec("reset role");
  await db.query(
    "insert into auth.mfa_factors(user_id,status) values($1,'verified')",
    [ids.farmer],
  );
  await as("farmer");
  assert.equal((await db.query("select * from public.reports")).rows.length, 0);
  await assert.rejects(() => rpc("/reports"), /MFA_OR_VERIFICATION/);
  await as("farmer", "aal2");
  await rpc("/auth/logout-all", "POST");
  await assert.rejects(() => rpc("/reports"), /AUTH_REQUIRED/);
});
test('anonymous callers have no table or workflow access and public wrappers cannot bypass RLS',async()=>{
 await db.exec('reset role');
 const rows=(await db.query("select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'")).rows;
 assert.ok(rows.length>=5);assert.ok(rows.every(r=>r.relrowsecurity));
 const functions=(await db.query("select proname,prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like 'farmrelay_%'")).rows;
 assert.equal(functions.length,3);assert.ok(functions.every(f=>!f.prosecdef));
 await db.exec('set role anon');await assert.rejects(()=>db.query('select * from public.reports'),/permission denied/);await assert.rejects(()=>rpc('/reports'),/permission denied/);
});
