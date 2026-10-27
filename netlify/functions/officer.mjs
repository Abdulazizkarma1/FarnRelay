import {
  equal,
  officerConfigured,
  sessionCookie,
  isOfficer,
  originAllowed,
  json,
} from "./lib/access.mjs";
export default async function handler(request) {
  if (request.method === "GET")
    return json({
      authenticated: isOfficer(request),
      configured: officerConfigured(),
    });
  if (request.method !== "POST" || !originAllowed(request))
    return json({ error: "Request not allowed." }, 405);
  if (!officerConfigured())
    return json(
      {
        error:
          "The site owner must set OFFICER_ACCESS_KEY to a secret of at least 24 characters in Netlify and redeploy.",
      },
      503,
    );
  const raw = await request.text();
  if (raw.length > 1024) return json({ error: "Request too large." }, 413);
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (data.action === "logout")
    return json({ authenticated: false }, 200, {
      "Set-Cookie": sessionCookie(true),
    });
  if (!equal(data.key, process.env.OFFICER_ACCESS_KEY))
    return json({ error: "The access key is incorrect." }, 401);
  return json({ authenticated: true }, 200, { "Set-Cookie": sessionCookie() });
}
export const config = {
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
