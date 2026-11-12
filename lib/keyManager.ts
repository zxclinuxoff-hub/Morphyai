export type KeyStatus = "active" | "cooldown" | "disabled";
export type Strategy = "round-robin" | "first-available";

interface KeyEntry {
  index: number;
  secret: string;
  mask: string;
  status: KeyStatus;
  cooldownUntil: number;
  disabledReason?: string;
  requests: number;
  errors: number;
}

export interface KeyLease {
  index: number;
  id: string;
  key: string;
}

export interface KeySnapshot {
  index: number;
  id: string;
  status: KeyStatus;
  cooldownUntil?: string;
  disabledReason?: string;
  requests: number;
  errors: number;
}

export class AllKeysUnavailableError extends Error {
  constructor(readonly retryAfterMs: number) {
    super(`All API keys are unavailable. Retry in about ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = "AllKeysUnavailableError";
  }
}

const DEFAULT_COOLDOWN_MS = 60_000;

export function maskKey(secret: string, index: number): string {
  return `key#${index} ...${secret.slice(-4)}`;
}

export class KeyManager {
  private readonly entries: KeyEntry[];
  private cursor = 0;

  constructor(
    keys: string[],
    private readonly strategy: Strategy = "round-robin",
    private readonly now: () => number = () => Date.now(),
    private readonly log: (msg: string) => void = (msg) => console.warn(msg),
  ) {
    const unique = [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
    if (unique.length === 0) throw new Error("No API keys configured");
    this.entries = unique.map((secret, i) => ({
      index: i + 1,
      secret,
      mask: maskKey(secret, i + 1),
      status: "active",
      cooldownUntil: 0,
      requests: 0,
      errors: 0,
    }));
  }

  acquire(): KeyLease {
    this.refresh();
    const n = this.entries.length;
    const start = this.strategy === "round-robin" ? this.cursor : 0;
    for (let i = 0; i < n; i++) {
      const pos = (start + i) % n;
      const entry = this.entries[pos];
      if (entry.status !== "active") continue;
      if (this.strategy === "round-robin") this.cursor = (pos + 1) % n;
      entry.requests++;
      return { index: entry.index, id: entry.mask, key: entry.secret };
    }
    throw new AllKeysUnavailableError(this.retryAfterMs());
  }

  reportSuccess(index: number): void {
    const entry = this.byIndex(index);
    if (entry && entry.status === "cooldown") this.refresh();
  }

  reportFailure(index: number, status: number, opts: { retryAfterMs?: number } = {}): void {
    const entry = this.byIndex(index);
    if (!entry) return;
    entry.errors++;

    if (status === 401) {
      this.disable(entry, "unauthorized (401)");
    } else if (status === 403) {
      this.disable(entry, "forbidden (403)");
    } else if (status === 402) {
      if (opts.retryAfterMs !== undefined) this.cool(entry, opts.retryAfterMs, "quota (402)");
      else this.disable(entry, "quota exhausted (402)");
    } else if (status === 429 || status >= 500) {
      this.cool(entry, opts.retryAfterMs ?? DEFAULT_COOLDOWN_MS, `status ${status}`);
    }
  }

  reEnable(index: number): void {
    const entry = this.byIndex(index);
    if (!entry) return;
    entry.status = "active";
    entry.cooldownUntil = 0;
    entry.disabledReason = undefined;
  }

  snapshot(): KeySnapshot[] {
    this.refresh();
    return this.entries.map((e) => ({
      index: e.index,
      id: e.mask,
      status: e.status,
      cooldownUntil: e.status === "cooldown" ? new Date(e.cooldownUntil).toISOString() : undefined,
      disabledReason: e.disabledReason,
      requests: e.requests,
      errors: e.errors,
    }));
  }

  private byIndex(index: number): KeyEntry | undefined {
    return this.entries.find((e) => e.index === index);
  }

  private cool(entry: KeyEntry, ms: number, reason: string): void {
    if (entry.status === "disabled") return;
    entry.status = "cooldown";
    entry.cooldownUntil = this.now() + ms;
    entry.disabledReason = reason;
    this.log(`[keyManager] ${entry.mask} cooldown ${Math.ceil(ms / 1000)}s (${reason})`);
  }

  private disable(entry: KeyEntry, reason: string): void {
    entry.status = "disabled";
    entry.cooldownUntil = 0;
    entry.disabledReason = reason;
    this.log(`[keyManager] ${entry.mask} disabled (${reason})`);
  }

  private refresh(): void {
    const t = this.now();
    for (const e of this.entries) {
      if (e.status === "cooldown" && t >= e.cooldownUntil) {
        e.status = "active";
        e.cooldownUntil = 0;
        e.disabledReason = undefined;
      }
    }
  }

  private retryAfterMs(): number {
    const t = this.now();
    const waits = this.entries
      .filter((e) => e.status === "cooldown")
      .map((e) => Math.max(0, e.cooldownUntil - t));
    return waits.length ? Math.min(...waits) : DEFAULT_COOLDOWN_MS;
  }
}
