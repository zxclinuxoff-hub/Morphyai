import { test } from "node:test";
import assert from "node:assert/strict";
import { KeyManager, AllKeysUnavailableError } from "./keyManager";

function makeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}
const silent = () => {};

test("round-robin rotates across keys", () => {
  const km = new KeyManager(["aaaa1", "bbbb2", "cccc3"], "round-robin", makeClock().now, silent);
  assert.deepEqual([1, 2, 3, 1].map(() => km.acquire().index), [1, 2, 3, 1]);
});

test("429 puts key on cooldown and it is skipped", () => {
  const km = new KeyManager(["aaaa1", "bbbb2"], "round-robin", makeClock().now, silent);
  const first = km.acquire();
  km.reportFailure(first.index, 429);
  assert.equal(km.acquire().index, 2);
  assert.equal(km.acquire().index, 2);
});

test("429 honours Retry-After and key returns after cooldown", () => {
  const clock = makeClock();
  const km = new KeyManager(["aaaa1", "bbbb2"], "round-robin", clock.now, silent);
  km.reportFailure(1, 429, { retryAfterMs: 5_000 });
  assert.equal(km.acquire().index, 2);
  clock.advance(4_999);
  assert.equal(km.acquire().index, 2);
  clock.advance(1);
  const indices = [km.acquire().index, km.acquire().index];
  assert.ok(indices.includes(1));
});

test("5xx defaults to a 60s cooldown", () => {
  const clock = makeClock();
  const km = new KeyManager(["aaaa1"], "round-robin", clock.now, silent);
  km.reportFailure(1, 503);
  assert.throws(() => km.acquire(), AllKeysUnavailableError);
  clock.advance(59_999);
  assert.throws(() => km.acquire(), AllKeysUnavailableError);
  clock.advance(1);
  assert.equal(km.acquire().index, 1);
});

test("402 without reset time disables the key permanently", () => {
  const clock = makeClock();
  const km = new KeyManager(["aaaa1", "bbbb2"], "round-robin", clock.now, silent);
  km.reportFailure(1, 402);
  clock.advance(10 * 60_000);
  for (let i = 0; i < 5; i++) assert.equal(km.acquire().index, 2);
  assert.equal(km.snapshot()[0].status, "disabled");
});

test("402 with a reset time becomes a cooldown", () => {
  const clock = makeClock();
  const km = new KeyManager(["aaaa1"], "round-robin", clock.now, silent);
  km.reportFailure(1, 402, { retryAfterMs: 1_000 });
  assert.equal(km.snapshot()[0].status, "cooldown");
  clock.advance(1_000);
  assert.equal(km.acquire().index, 1);
});

test("401 and 403 disable the key", () => {
  const km = new KeyManager(["aaaa1", "bbbb2", "cccc3"], "round-robin", makeClock().now, silent);
  km.reportFailure(1, 401);
  km.reportFailure(2, 403);
  assert.equal(km.acquire().index, 3);
  assert.equal(km.acquire().index, 3);
});

test("all keys dead throws with a retry hint", () => {
  const km = new KeyManager(["aaaa1", "bbbb2"], "round-robin", makeClock().now, silent);
  km.reportFailure(1, 401);
  km.reportFailure(2, 401);
  assert.throws(() => km.acquire(), (err: unknown) => err instanceof AllKeysUnavailableError);
});

test("first-available always prefers the first active key", () => {
  const km = new KeyManager(["aaaa1", "bbbb2"], "first-available", makeClock().now, silent);
  assert.equal(km.acquire().index, 1);
  assert.equal(km.acquire().index, 1);
  km.reportFailure(1, 429);
  assert.equal(km.acquire().index, 2);
});

test("duplicate and blank keys are removed", () => {
  const km = new KeyManager([" aaaa1 ", "aaaa1", "", "bbbb2"], "round-robin", makeClock().now, silent);
  assert.equal(km.snapshot().length, 2);
});

test("snapshot never contains secrets", () => {
  const km = new KeyManager(["supersecret-a1f9"], "round-robin", makeClock().now, silent);
  km.reportFailure(1, 429);
  const json = JSON.stringify(km.snapshot());
  assert.ok(!json.includes("supersecret"));
  assert.ok(json.includes("...a1f9"));
});

test("constructor rejects an empty pool", () => {
  assert.throws(() => new KeyManager(["  ", ""], "round-robin", makeClock().now, silent));
});
