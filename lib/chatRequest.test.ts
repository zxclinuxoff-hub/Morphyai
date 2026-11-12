import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseChatBody } from "./chatRequest";

const request = (max_tokens: number) => ({
  model: "test-model",
  messages: [{ role: "user", content: "Hi" }],
  max_tokens,
});

test("accepts a 120000 token output request", () => {
  assert.equal(parseChatBody(request(120000))?.max_tokens, 120000);
});

test("clamps larger output requests to the configured maximum", () => {
  assert.equal(parseChatBody(request(200000))?.max_tokens, 120000);
});
