export async function readChatStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (delta: string) => void,
): Promise<boolean> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let hasContent = false;

  const processLine = (line: string) => {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    let delta: unknown;
    try {
      delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
    } catch {
      // Ignore non-JSON SSE lines.
    }
    if (typeof delta === "string" && delta.length > 0) {
      hasContent = true;
      onDelta(delta);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      if (buffer) processLine(buffer);
      return hasContent;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(processLine);
  }
}
