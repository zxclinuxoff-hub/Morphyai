import { getPool } from "@/lib/pool";
import { openaiRequest } from "@/lib/providers/openai";
import { AllKeysUnavailableError } from "@/lib/keyManager";
import type { ChatBody } from "@/lib/chatRequest";

function retryAfterMs(res: Response): number | undefined {
  const h = res.headers.get("retry-after");
  if (!h) return undefined;
  const secs = Number(h);
  return Number.isFinite(secs) && secs >= 0 ? secs * 1000 : undefined;
}

export async function requestChat(body: ChatBody, signal?: AbortSignal): Promise<Response> {
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
      upstream = await openaiRequest(lease.key, body, signal);
    } catch {
      if (signal?.aborted) return new Response(null, { status: 499 });
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

    pool.reportFailure(lease.index, upstream.status, { retryAfterMs: retryAfterMs(upstream) });
    lastStatus = upstream.status;
    await upstream.body?.cancel().catch(() => {});
  }

  return Response.json(
    { error: "Сервис временно недоступен, попробуйте позже", upstreamStatus: lastStatus },
    { status: 503 },
  );
}
