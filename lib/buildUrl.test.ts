import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUrl } from "./buildUrl";

test("joins base and path with a single slash", () => {
  assert.equal(buildUrl("https://coarena.ai/api/v1/", "/chat/completions"), "https://coarena.ai/api/v1/chat/completions");
});

test("does not duplicate /v1 when path already has it", () => {
  assert.equal(buildUrl("https://coarena.ai/api/v1", "/v1/chat/completions"), "https://coarena.ai/api/v1/chat/completions");
});

test("adds /v1 when the path brings it and the base does not", () => {
  assert.equal(buildUrl("https://coarena.ai/api", "v1/messages"), "https://coarena.ai/api/v1/messages");
});

test("handles multiple trailing and leading slashes", () => {
  assert.equal(buildUrl("https://example.com///", "///models"), "https://example.com/models");
});
