import { writeFile } from "node:fs/promises";
const raw = process.env.VITE_SUPABASE_URL;
let origin = "",
  websocket = "";
if (raw) {
  const u = new URL(raw);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.pathname !== "/" ||
    u.search ||
    u.hash
  )
    throw Error("VITE_SUPABASE_URL must be an HTTPS project origin.");
  origin = u.origin;
  websocket = origin.replace("https:", "wss:");
}
const csp = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${origin}; media-src 'self' data: blob: ${origin}; connect-src 'self' ${origin} ${websocket}; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`;
await writeFile(
  "dist/_headers",
  `/*\n  Content-Security-Policy: ${csp}\n  Referrer-Policy: no-referrer\n`,
);
await writeFile("dist/_redirects", "/* /index.html 200\n");
