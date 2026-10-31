import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";
import { chromium } from "@playwright/test";
// Production bundle, simulated mobile network/CPU. No authenticated data is loaded.
const origin = "http://127.0.0.1:4174";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4174",
    "--strictPort",
  ],
  { stdio: "ignore" },
);
let chrome;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(origin);
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw Error("Production preview did not start.");
  chrome = await launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ["--headless", "--no-sandbox", "--disable-dev-shm-usage"],
  });
  const { lhr, report } = await lighthouse(origin, {
    port: chrome.port,
    output: "json",
    logLevel: "error",
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
  });
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/mobile-lighthouse.json", report);
  const scores = Object.fromEntries(
    Object.entries(lhr.categories).map(([key, c]) => [
      key,
      Math.round(c.score * 100),
    ]),
  );
  await writeFile(
    "artifacts/mobile-scores.json",
    JSON.stringify(
      {
        scores,
        formFactor: lhr.configSettings.formFactor,
        fetchTime: lhr.fetchTime,
        scope:
          "Unauthenticated landing, production bundle, CI Chromium; not a field-device result",
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(scores));
  if (scores.performance < 90 || scores.accessibility < 95 || scores.seo < 90)
    throw Error(
      "Mobile Lighthouse quality threshold failed. Inspect the report artifact.",
    );
} finally {
  await chrome?.kill();
  server.kill();
}
