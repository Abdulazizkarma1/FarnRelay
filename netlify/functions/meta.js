import { createClient } from "@supabase/supabase-js";
import { createMeta, validateWav } from "./lib/meta.js";
import { HttpError } from "./lib/errors.js";
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export function createHandler({
  env = process.env,
  fetcher = fetch,
  clientFactory = createClient,
} = {}) {
  return async (req) => {
    try {
      if (req.method !== "POST") return json({ error: "POST required." }, 405);
      if (!env.APP_ORIGIN || req.headers.get("origin") !== env.APP_ORIGIN)
        throw new HttpError(403, "Request origin is not allowed.");
      if (
        !env.SUPABASE_URL ||
        !env.SUPABASE_PUBLISHABLE_KEY ||
        !env.SUPABASE_SECRET_KEY ||
        !env.MODEL_API_KEY
      )
        throw new HttpError(503, "AI service is not configured.");
      const token = req.headers.get("authorization");
      if (!token?.startsWith("Bearer "))
        throw new HttpError(401, "Sign in to use AI assistance.");
      const id = req.headers.get("x-report-id"),
        kind = req.headers.get("x-ai-action");
      if (
        !/^[0-9a-f-]{36}$/i.test(id || "") ||
        !["brief", "segment", "transcribe"].includes(kind)
      )
        throw new HttpError(400, "Invalid AI action.");
      const length = Number(req.headers.get("content-length") || 0);
      if (length > 1000000) throw new HttpError(413, "Recording is too large.");
      const db = clientFactory(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
        global: { headers: { Authorization: token } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: context, error } = await db.rpc("farmrelay_ai_context", {
        p_report_id: id,
      });
      if (error)
        throw new HttpError(
          error.message?.startsWith("RATE_LIMIT") ? 429 : 403,
          "This request is not allowed, or the AI request limit was reached.",
        );
      const report = context.report;
      let input = report;
      if (kind === "transcribe") {
        if (!report.audio?.path || report.audioLanguage !== "English")
          throw new HttpError(
            400,
            "An English recording is required for automatic transcription.",
          );
        if (req.headers.get("content-type") !== "audio/wav")
          throw new HttpError(400, "WAV audio required.");
        input = validateWav(Buffer.from(await req.arrayBuffer()));
      } else if (report.photo?.path) {
        const { data, error: downloadError } = await db.storage
          .from("crop-evidence")
          .download(report.photo.path);
        if (downloadError)
          throw new HttpError(
            403,
            "The photo is no longer available for review.",
          );
        report.photo = {
          ...report.photo,
          data: Buffer.from(await data.arrayBuffer()),
        };
      }
      const result = await createMeta(
        {
          MODEL_API_KEY: env.MODEL_API_KEY,
          META_MODEL: env.META_MODEL || "muse-spark-1.3",
        },
        fetcher,
      )[kind](input);
      const service = clientFactory(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: saveError } = await service.rpc("farmrelay_save_ai", {
        p_report_id: id,
        p_actor: context.actor,
        p_session: context.sessionId,
        p_access_version: context.accessVersion,
        p_kind: kind,
        p_result: result,
      });
      if (saveError)
        throw new HttpError(
          409,
          "Access changed or the result could not be saved. Refresh the report before retrying.",
        );
      return json({ result });
    } catch (e) {
      return json(
        {
          error: e.status
            ? e.message
            : "The AI request could not be completed. Please retry.",
        },
        e.status || 500,
      );
    }
  };
}
export default createHandler();
