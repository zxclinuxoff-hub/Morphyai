import { getBackgroundJob } from "@/lib/backgroundJobs";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const rl = rateLimit(`background-task-status:${clientIp(req)}`, 120);
  if (!rl.ok) {
    return Response.json(
      { error: "Слишком много запросов статуса задачи" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: "Некорректный идентификатор задачи" }, { status: 400 });
  }
  const job = getBackgroundJob(id);
  if (!job) return Response.json({ error: "Задача не найдена или истёк срок хранения" }, { status: 404 });
  return Response.json(job, { headers: { "Cache-Control": "no-store" } });
}
