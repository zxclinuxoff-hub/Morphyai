import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DEFAULT_SETTINGS, MAX_OUTPUT_TOKENS, normalizeSettings } from "./settings";

test("allows output limits up to 120000 tokens", () => {
  assert.equal(MAX_OUTPUT_TOKENS, 120000);
  assert.equal(normalizeSettings({ maxTokens: 110000 }).maxTokens, 110000);
  assert.equal(normalizeSettings({ maxTokens: 150000 }).maxTokens, 120000);
});

test("defaults to a 50000 token output limit", () => {
  assert.equal(DEFAULT_SETTINGS.maxTokens, 50000);
});
