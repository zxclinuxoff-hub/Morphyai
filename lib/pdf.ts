// Допущение: версия pdfjs-dist зафиксирована в package.json. Проверьте, что путь legacy-сборки совпадает с версией.
export async function extractPdfText(file: File, maxPages = 200): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();

  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  const count = Math.min(doc.numPages, maxPages);

  for (let i = 1; i <= count; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => (item as { str?: string }).str ?? "")
      .join(" ")
      .replace(/[ \t]+/g, " ")
      .trim();
    if (text) pages.push(text);
  }

  await doc.destroy();
  return pages.join("\n\n");
}
