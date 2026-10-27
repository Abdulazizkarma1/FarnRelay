import { writeFile } from "node:fs/promises";
// Netlify builds require a same-origin proxy so cookies work across browsers.
const origin = process.env.API_PROXY_TARGET;
if (process.env.NETLIFY === "true" && !origin)
  throw Error(
    "Set API_PROXY_TARGET to your Railway HTTPS origin before deploying this migration on Netlify.",
  );
if (origin) {
  const url = new URL(origin);
  if (
    url.protocol !== "https:" ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw Error(
      "API_PROXY_TARGET must be an HTTPS origin, without credentials, path or query.",
    );
  await writeFile(
    "dist/_redirects",
    `/api/* ${url.origin}/api/:splat 200!\n/* /index.html 200\n`,
  );
}
