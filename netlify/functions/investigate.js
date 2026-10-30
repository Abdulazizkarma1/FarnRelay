import { createClient } from "@supabase/supabase-js";
import { createMeta, validateWav } from "./lib/meta.js";
import { investigate } from "./lib/investigation.js";
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
export function createInvestigationHandler({
  env = process.env,
  clientFactory = createClient,
  fetcher = fetch,
} = {}) {
  return async (req) => {
    let runId, service;
    try {
      if (req.method !== "POST") return json({ error: "POST required." }, 405);
      if (!env.APP_ORIGIN || req.headers.get("origin") !== env.APP_ORIGIN)
        return json({ error: "Request origin is not allowed." }, 403);
      if (
        !env.SUPABASE_URL ||
        !env.SUPABASE_PUBLISHABLE_KEY ||
        !env.SUPABASE_SECRET_KEY ||
        !env.MODEL_API_KEY
      )
        return json({ error: "AI service is not configured." }, 503);
      const token = req.headers.get("authorization"),
        id = req.headers.get("x-report-id"),
        kind = req.headers.get("x-ai-action");
      if (!token?.startsWith("Bearer "))
        return json({ error: "Sign in to continue." }, 401);
      if (
        !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id || "") ||
        !["investigate", "guide", "segment", "transcribe"].includes(kind)
      )
        return json({ error: "Invalid AI action." }, 400);
      const db = clientFactory(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
        global: { headers: { Authorization: token } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: context, error } = await db.rpc(
        "farmrelay_start_analysis",
        { p_report_id: id, p_kind: kind },
      );
      if (error)
        return json(
          {
            error: error.message?.startsWith("PROCESSING")
              ? "Analysis is already running. Refresh shortly."
              : "Case unavailable, unsupported crop, or AI limit reached.",
          },
          error.message?.startsWith("PROCESSING") ? 409 : 403,
        );
      if (context.cached)
        return json({ result: context.run.result, cached: true });
      runId = context.run.id;
      service = clientFactory(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const snapshot = context.case;
      let result;
      if (kind === "transcribe") {
        const e = snapshot.evidence.filter((e) => e.kind === "audio").at(-1);
        if (!e || e.language !== "English")
          throw Object.assign(Error("An English recording is required."), {
            status: 400,
          });
        if (req.headers.get("content-type") !== "audio/wav")
          throw Object.assign(Error("WAV recording required."), {
            status: 400,
          });
        // Bound bytes even when content-length is absent or untrusted.
        const reader = req.body?.getReader();
        const chunks = [];
        let size = 0;
        if (!reader)
          throw Object.assign(Error("Recording required."), { status: 400 });
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 960044) {
            await reader.cancel();
            throw Object.assign(Error("Recording is too large."), {
              status: 413,
            });
          }
          chunks.push(Buffer.from(value));
        }
        result = await createMeta(env, fetcher).transcribe(
          validateWav(Buffer.concat(chunks)),
        );
        result.evidenceId = e.id;
      } else {
        const photos = snapshot.evidence
          .filter((e) => e.kind === "photo")
          .slice(-3);
        for (const e of photos) {
          const { data, error: downloadError } = await db.storage
            .from("crop-evidence")
            .download(e.media.path);
          if (downloadError) throw Error("Evidence unavailable.");
          e.data = Buffer.from(await data.arrayBuffer());
        }
        if (kind === "segment") {
          const e = photos.at(-1);
          if (!e)
            throw Object.assign(Error("Attach a photograph first."), {
              status: 400,
            });
          result = await createMeta(env, fetcher).segment({
            photo: { ...e.media, data: e.data },
          });
          result.evidenceId = e.id;
        } else
          result = await investigate(
            { ...snapshot, evidence: snapshot.evidence },
            env,
            fetcher,
            kind,
          );
      }
      const { error: saveError } = await service.rpc(
        "farmrelay_finish_analysis",
        { p_run_id: runId, p_result: result, p_error: null },
      );
      if (saveError)
        throw Object.assign(
          Error("Result could not be saved. Refresh before retrying."),
          { status: 409 },
        );
      const { data: final, error: finalError } = await db
        .from("ai_runs")
        .select("state,result")
        .eq("id", runId)
        .single();
      if (finalError || final.state !== "complete")
        return json(
          {
            error:
              "Evidence or access changed. Refresh and analyse the current case.",
          },
          409,
        );
      return json({ result: final.result, cached: false });
    } catch (e) {
      if (runId && service)
        await service
          .rpc("farmrelay_finish_analysis", {
            p_run_id: runId,
            p_result: null,
            p_error: "Analysis could not complete. Retry available.",
          })
          .catch(() => {});
      return json(
        {
          error: e.status
            ? e.message
            : "Analysis could not complete. Your evidence is saved; retry later.",
        },
        e.status || 502,
      );
    }
  };
}
export default createInvestigationHandler();
