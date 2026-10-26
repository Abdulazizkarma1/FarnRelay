export default async function handler(request) {
  if (request.method !== "GET")
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  return Response.json(
    { configured: Boolean(process.env.MODEL_API_KEY) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
