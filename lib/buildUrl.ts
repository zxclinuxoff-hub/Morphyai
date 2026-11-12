/**
 * Joins a base URL and a path without double slashes or duplicated /v1 segments.
 * buildUrl("https://coarena.ai/api/v1", "/v1/chat/completions") -> https://coarena.ai/api/v1/chat/completions
 * buildUrl("https://coarena.ai/api", "v1/messages")             -> https://coarena.ai/api/v1/messages
 */
export function buildUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = "/" + path.replace(/^\/+/, "");
  return (b + p).replace(/\/v1\/v1(?=\/|$)/g, "/v1");
}
