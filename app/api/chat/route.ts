import { getPool } from "@/lib/pool";
import { openaiRequest, ChatMessage, ContentPart } from "@/lib/providers/openai";
import { AllKeysUnavailableError } from "@/lib/keyManager";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGES = 200;
const MAX_TEXT_CHARS = 200_000;
const MAX_IMAGES = 4;
const MAX_IMAGE_URL_CHARS = 6_000_000;
const IMAGE_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

interface ChatBody {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

function parseMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;

  let textChars = 0;
  let images = 0;
  const out: ChatMessage[] = [];

  for (const item of raw as unknown[]) {
    if (!item || typeof item !== "object") return null;
    const { role, content } = item as { role?: unknown; content?: unknown };
    if (role !== "system" && role !== "user" && role !== "assistant") return null;

    if (typeof content === "string") {
      textChars += content.length;
      out.push({ role, content });
      continue;
    }

    if (role !== "user" || !Array.isArray(content)) return null;
    const parts: ContentPart[] = [];
    for (const p of content as unknown[]) {
      if (!p || typeof p !== "object") return null;
      const part = p as { type?: unknown; text?: unknown; image_url?: { url?: unknown } };
      if (part.type === "text" && typeof part.text === "string") {
        textChars += part.text.length;
        parts.push({ type: "text", text: part.text });
      } else if (part.type === "image_url") {
        const url = part.image_url?.url;
        if (typeof url !== "string" || url.length > MAX_IMAGE_URL_CHARS || !IMAGE_RE.test(url)) return null;
        images++;
        parts.push({ type: "image_url", image_url: { url } });
      } else {
        return null;
      }
    }
    out.push({ role, content: parts });
  }

  if (textChars > MAX_TEXT_CHARS || images > MAX_IMAGES) return null;
  return out;
}

function parseBody(raw: unknown): ChatBody | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.model !== "string" || !b.model || b.model.length > 200) return null;
  const messages = parseMessages(b.messages);
  if (!messages) return null;

  const temperature = typeof b.temperature === "number" ? Math.min(Math.max(b.temperature, 0), 2) : undefined;
  const max_tokens =
    typeof b.max_tokens === "number" ? Math.min(Math.max(Math.floor(b.max_tokens), 1), 8192) : undefined;

  return { model: b.model, messages, temperature, max_tokens };
}

function retryAfterMs(res: Response): number | undefined {
  const h = res.headers.get("retry-after");
  if (!h) return undefined;
  const secs = Number(h);
  return Number.isFinite(secs) && secs >= 0 ? secs * 1000 : undefined;
}

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
  const body = parseBody(json);
  if (!body) return Response.json({ error: "Некорректный запрос или слишком большой объём" }, { status: 400 });

  const pool = getPool();
  const attempts = Math.max(1, pool.snapshot().length);
  let lastStatus = 0;

  for (let i = 0; i < attempts; i++) {
    let lease;
    try {
      lease = pool.acquire();
    } catch (err) {
      if (err instanceof AllKeysUnavailableError) {
        const secs = Math.ceil(err.retryAfterMs / 1000);
        return Response.json(
          { error: "Все ключи временно недоступны", retryAfterSeconds: secs },
          { status: 503, headers: { "Retry-After": String(secs) } },
        );
      }
      throw err;
    }

    let upstream: Response;
    try {
      upstream = await openaiRequest(lease.key, body, req.signal);
    } catch {
      if (req.signal.aborted) return new Response(null, { status: 499 });
      pool.reportFailure(lease.index, 503);
      lastStatus = 503;
      continue;
    }

    if (upstream.ok && upstream.body) {
      pool.reportSuccess(lease.index);
      return new Response(upstream.body, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // Ошибка до первого токена: помечаем ключ и пробуем следующий.
    pool.reportFailure(lease.index, upstream.status, { retryAfterMs: retryAfterMs(upstream) });
    lastStatus = upstream.status;
    await upstream.body?.cancel().catch(() => {});
  }

  return Response.json(
    { error: "Сервис временно недоступен, попробуйте позже", upstreamStatus: lastStatus },
    { status: 503 },
  );
}
