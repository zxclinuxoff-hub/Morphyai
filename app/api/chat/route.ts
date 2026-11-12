import { requestChat } from "@/lib/chatCompletion";
import { parseChatBody } from "@/lib/chatRequest";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const limit = Number(process.env.RATE_LIMIT_PER_MIN ?? 30) || 30;
  const rl = rateLimit(`chat:${clientIp(req)}`, limit);
  if (!rl.ok) {
    return Response.json(
      { error: "Слишком много запросов, подождите немного", retryAfterSeconds: rl.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const body = parseChatBody(json);
  if (!body) return Response.json({ error: "Некорректный запрос или слишком большой объём" }, { status: 400 });

  return requestChat(body, req.signal);
}
