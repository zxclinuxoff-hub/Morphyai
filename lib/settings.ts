export interface Settings {
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
}

export const MAX_OUTPUT_TOKENS = 16384;

export const DEFAULT_SETTINGS: Settings = {
  systemPrompt: "",
  temperature: 0.7,
  maxTokens: 4096,
};

const KEY = "coarena.settings";

function clamp(n: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function normalizeSettings(s: Partial<Settings>): Settings {
  return {
    systemPrompt: typeof s.systemPrompt === "string" ? s.systemPrompt.slice(0, 8000) : "",
    temperature: clamp(Number(s.temperature), 0, 2, DEFAULT_SETTINGS.temperature),
    maxTokens: clamp(Math.round(Number(s.maxTokens)), 256, MAX_OUTPUT_TOKENS, DEFAULT_SETTINGS.maxTokens),
  };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeSettings(JSON.parse(raw)) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}
