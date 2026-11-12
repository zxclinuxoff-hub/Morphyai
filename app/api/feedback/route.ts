import { getPool } from "@/lib/pool";
import { buildUrl } from "@/lib/buildUrl";
import { authHeaders } from "@/lib/providers/openai";
import { feedbackBody } from "@/lib/feedback.config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  const b = raw as { model?: unknown; rating?: unknown };
  if (typeof b.model !== "string" || b.model.length === 0 || b.model.length > 200) {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (b.rating !== "up" && b.rating !== "down") {
    return Response.json({ ok: false }, { status: 400 });
  }

  const url = buildUrl(process.env.COARENA_BASE_URL ?? "https://coarena.ai/api/v1", "/feedback");
  const body = JSON.stringify(feedbackBody({ model: b.model, rating: b.rating }));
  const pool = getPool();
  const attempts = Math.max(1, pool.snapshot().length);

  for (let i = 0; i < attempts; i++) {
    let lease;
    try {
      lease = pool.acquire();
    } catch {
      break;
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(lease.key) },
      body,
    }).catch(() => null);

    if (res?.ok) {
      pool.reportSuccess(lease.index);
      return Response.json({ ok: true });
    }
    pool.reportFailure(lease.index, res?.status ?? 503);
  }

  // Оценка не должна ломать чат: отвечаем мягко.
  return Response.json({ ok: false });
}
