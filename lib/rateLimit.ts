// Допущение: счётчики живут в памяти одного инстанса. На Netlify у разных инстансов свои счётчики,
// поэтому лимит приблизительный. Для строгого лимита нужен общий store, например Redis или Upstash.
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs = 60_000): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, retryAfterSec: Math.ceil((recent[0] + windowMs - now) / 1000) };
  }

  recent.push(now);
  hits.set(key, recent);

  if (hits.size > 10_000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    }
  }
  return { ok: true, retryAfterSec: 0 };
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}
