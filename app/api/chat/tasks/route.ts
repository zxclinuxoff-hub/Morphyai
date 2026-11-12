import { requestChat } from "@/lib/chatCompletion";
import { createBackgroundJob, completeBackgroundJob, failBackgroundJob } from "@/lib/backgroundJobs";
import { parseChatBody } from "@/lib/chatRequest";
import { readChatStream } from "@/lib/chatStream";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function runTask(id: string, body: NonNullable<ReturnType<typeof parseChatBody>>): Promise<void> {
  try {
    const response = await requestChat(body, AbortSignal.timeout(2 * 60 * 60 * 1000));
    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => ({}));
      failBackgroundJob(id, data.error ?? "Не удалось выполнить фоновый запрос");
      return;
    }

    let content = "";
    const hasContent = await readChatStream(response.body, (delta) => {
      content += delta;
      if (content.length > 1_000_000) throw new Error("Ответ превысил максимальный размер хранения");
    });
    if (!hasContent) {
      failBackgroundJob(id, "Модель вернула пустой ответ");
      return;
    }
    completeBackgroundJob(id, content);
  } catch (error) {
    failBackgroundJob(id, error instanceof Error ? error.message : "Ошибка фонового запроса");
  }
}

export async function POST(req: Request): Promise<Response> {
  const rl = rateLimit(`background-chat:${clientIp(req)}`, 5);
  if (!rl.ok) {
    return Response.json(
      { error: "Слишком много фоновых запросов, попробуйте позже" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  if (!raw || typeof raw !== "object") return Response.json({ error: "Некорректный запрос" }, { status: 400 });
  const data = raw as Record<string, unknown>;
  const id = typeof data.task_id === "string" ? data.task_id : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: "Некорректный идентификатор задачи" }, { status: 400 });
  }
  const body = parseChatBody(data);
  if (!body) return Response.json({ error: "Некорректный запрос или слишком большой объём" }, { status: 400 });
  if (!createBackgroundJob(id)) {
    return Response.json({ error: "Слишком много активных задач или задача уже существует" }, { status: 429 });
  }

  void runTask(id, body);
  return Response.json({ task_id: id }, { status: 202 });
}
