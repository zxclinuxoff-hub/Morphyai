import { KeyManager, Strategy } from "./keyManager";

// Ключи читаются только на сервере из переменных окружения.
const globalForPool = globalThis as unknown as { __coarenaPool?: KeyManager };

export function getPool(): KeyManager {
  if (!globalForPool.__coarenaPool) {
    const keys = (process.env.COARENA_API_KEYS ?? "").split(",");
    const strategy = (process.env.KEY_STRATEGY ?? "round-robin") as Strategy;
    globalForPool.__coarenaPool = new KeyManager(keys, strategy);
  }
  return globalForPool.__coarenaPool;
}
