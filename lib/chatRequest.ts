import type { ChatMessage, ContentPart } from "@/lib/providers/openai";
import { MAX_OUTPUT_TOKENS } from "@/lib/settings";

export interface ChatBody {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

const MAX_MESSAGES = 200;
const MAX_TEXT_CHARS = 200_000;
const MAX_IMAGES = 4;
const MAX_IMAGE_URL_CHARS = 6_000_000;
const IMAGE_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

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

export function parseChatBody(raw: unknown): ChatBody | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.model !== "string" || !b.model || b.model.length > 200) return null;
  const messages = parseMessages(b.messages);
  if (!messages) return null;

  const temperature = typeof b.temperature === "number" ? Math.min(Math.max(b.temperature, 0), 2) : undefined;
  const max_tokens =
    typeof b.max_tokens === "number" ? Math.min(Math.max(Math.floor(b.max_tokens), 1), MAX_OUTPUT_TOKENS) : undefined;

  return { model: b.model, messages, temperature, max_tokens };
}
