import { buildUrl } from "../buildUrl";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

const BASE = process.env.COARENA_BASE_URL ?? "https://coarena.ai/api/v1";
const AUTH_MODE = process.env.COARENA_AUTH_MODE ?? "bearer";

export function chatUrl(): string {
  return buildUrl(BASE, "/chat/completions");
}

export function modelsUrl(): string {
  return buildUrl(BASE, "/models");
}

// Допущение: авторизация Bearer по умолчанию, режим x-api-key задаётся в env.
export function authHeaders(key: string): Record<string, string> {
  return AUTH_MODE === "x-api-key"
    ? { "x-api-key": key }
    : { Authorization: `Bearer ${key}` };
}

export function openaiRequest(key: string, body: ChatRequest, signal?: AbortSignal): Promise<Response> {
  return fetch(chatUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...authHeaders(key) },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  });
}
