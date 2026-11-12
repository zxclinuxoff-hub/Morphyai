export const TEXT_EXT = [
  "txt", "md", "csv", "tsv", "json", "js", "jsx", "ts", "tsx", "py", "html", "css", "scss",
  "xml", "yml", "yaml", "sql", "sh", "java", "go", "rs", "c", "cpp", "h", "cs", "php", "rb",
  "swift", "kt", "log", "ini", "toml", "env",
];
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const MAX_TEXT_BYTES = 1_000_000;
export const MAX_IMAGE_BYTES = 4_000_000;
export const MAX_ATTACHMENTS = 5;
export const MAX_PDF_BYTES = 10_000_000;

export type Attachment =
  | { kind: "text"; name: string; content: string }
  | { kind: "image"; name: string; dataUrl: string };

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Не удалось прочитать файл"));
    r.readAsDataURL(file);
  });
}

// Проверка на клиенте. Сервер проверяет то же самое повторно.
export async function readAttachment(file: File): Promise<Attachment> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (IMAGE_TYPES.includes(file.type)) {
    if (file.size > MAX_IMAGE_BYTES) throw new Error(`«${file.name}»: изображение больше 4 МБ`);
    return { kind: "image", name: file.name, dataUrl: await readAsDataUrl(file) };
  }

  if (file.type === "application/pdf" || ext === "pdf") {
    if (file.size > MAX_PDF_BYTES) throw new Error(`«${file.name}»: PDF больше 10 МБ`);
    const { extractPdfText } = await import("./pdf");
    const text = await extractPdfText(file);
    if (!text.trim()) throw new Error(`«${file.name}»: в PDF нет текстового слоя (скан?)`);
    const clipped = text.length > MAX_TEXT_BYTES ? text.slice(0, MAX_TEXT_BYTES) + "\n[текст обрезан]" : text;
    return { kind: "text", name: file.name, content: clipped };
  }

  if (TEXT_EXT.includes(ext) || file.type.startsWith("text/")) {
    if (file.size > MAX_TEXT_BYTES) throw new Error(`«${file.name}»: файл больше 1 МБ`);
    return { kind: "text", name: file.name, content: await file.text() };
  }

  throw new Error(`«${file.name}»: тип файла не поддерживается`);
}

// Текст файла оборачивается в блок кода. Длина забора подбирается под содержимое.
export function formatTextFile(name: string, content: string): string {
  const fence = content.includes("```") ? "````" : "```";
  return `Файл: ${name}\n${fence}\n${content}\n${fence}`;
}
