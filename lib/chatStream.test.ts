import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readChatStream } from "./chatStream";

test("reads a final SSE data line without a trailing newline", async () => {
  const chunks = [
    new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Ответ"}}]}'),
  ];
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
  let result = "";

  const hasContent = await readChatStream(body, (delta) => {
    result += delta;
  });

  assert.equal(hasContent, true);
  assert.equal(result, "Ответ");
});

test("reads multiple deltas and ignores the done marker", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"A"}}]}\n'));
      controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"B"}}]}\n'));
      controller.enqueue(new TextEncoder().encode("data: [DONE]\n"));
      controller.close();
    },
  });
  let result = "";

  const hasContent = await readChatStream(body, (delta) => {
    result += delta;
  });

  assert.equal(hasContent, true);
  assert.equal(result, "AB");
});

test("reports a stream with no text as empty", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("data: [DONE]\n"));
      controller.close();
    },
  });

  assert.equal(await readChatStream(body, () => assert.fail("unexpected delta")), false);
});
