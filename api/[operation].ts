import { handleOperation } from "../server/handler.js";
// Per-instance backstop; configure Vercel Firewall rate limits for a public deployment.
const requests = new Map<string, { count: number; until: number }>();
export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET" && req.query.operation === "health")
    return res
      .status(200)
      .json({
        ok: true,
        geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      });
  if (req.method !== "POST")
    return res.status(405).json({ error: "POST required" });
  const id = String(req.headers["x-forwarded-for"] || "anonymous").split(
    ",",
  )[0];
  const now = Date.now();
  for (const [key, value] of requests)
    if (value.until < now) requests.delete(key);
  const entry = requests.get(id) || { count: 0, until: now + 60000 };
  requests.set(id, entry);
  if (++entry.count > 12)
    return res
      .status(429)
      .json({ error: "Too many requests. Try again in a minute." });
  if (JSON.stringify(req.body || {}).length > 4_100_000)
    return res.status(413).json({ error: "Image too large" });
  const result = await handleOperation(String(req.query.operation), req.body);
  return res.status(result.status).json(result.data);
}
