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

// Generate the shell manifest from this exact build, including lazy route chunks.
const { readdir, readFile } = await import("node:fs/promises");
const { createHash } = await import("node:crypto");
const assets = (await readdir("dist/assets"))
  .filter((f) => /\.(js|css|woff2)$/.test(f))
  .map((f) => "/assets/" + f);
const revision = createHash("sha256")
  .update(await readFile("dist/index.html"))
  .digest("hex")
  .slice(0, 12);
const shell = [
  "/",
  "/index.html",
  "/favicon.svg",
  "/manifest.webmanifest",
  ...assets,
];
await writeFile(
  "dist/sw.js",
  `const CACHE='farmrelay-shell-${revision}';const SHELL=${JSON.stringify(shell)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('farmrelay-shell-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==self.location.origin)return;if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('/index.html')));return;}if(SHELL.includes(u.pathname))event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));});
`,
);
