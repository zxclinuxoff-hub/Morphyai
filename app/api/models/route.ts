import { getPool } from "@/lib/pool";
import { modelsUrl, authHeaders } from "@/lib/providers/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_MS = 5 * 60_000;
let cache: { at: number; data: unknown } | null = null;

export async function GET(): Promise<Response> {
  if (cache && Date.now() - cache.at < TTL_MS) return Response.json(cache.data);

  const pool = getPool();
  const attempts = Math.max(1, pool.snapshot().length);

  for (let i = 0; i < attempts; i++) {
    let lease;
    try {
      lease = pool.acquire();
    } catch {
      break;
    }
    const res = await fetch(modelsUrl(), { headers: authHeaders(lease.key) }).catch(() => null);
    if (res?.ok) {
      const data = await res.json().catch(() => null);
      if (data) {
        pool.reportSuccess(lease.index);
        cache = { at: Date.now(), data };
        return Response.json(data);
      }
    }
    pool.reportFailure(lease.index, res?.status ?? 503);
  }

  return Response.json({ error: "Список моделей временно недоступен" }, { status: 503 });
}
