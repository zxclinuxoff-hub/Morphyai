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
export const MAX_ZIP_BYTES = 10_000_000;

export type Attachment =
  | { kind: "text"; name: string; content: string }
  | { kind: "image"; name: string; dataUrl: string };

interface ZipTextFile {
  path: string;
  content: string;
}

function safeZipPath(path: string): string | null {
  const normalized = path.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[a-z]:/i.test(normalized)) return null;
  const parts = normalized.split("/");
  if (parts.some((part) => part === ".." || part.includes("\0"))) return null;
  return parts.filter((part) => part && part !== ".").join("/") || null;
}

export async function extractZipFiles(data: Uint8Array): Promise<ZipTextFile[]> {
  const { AsyncUnzipInflate, Unzip, UnzipPassThrough } = await import("fflate");
  const maxEntries = 100;
  const maxFileBytes = MAX_TEXT_BYTES;
  const maxTotalBytes = 4_000_000;
  const maxTextChars = 150_000;
  const tasks: Promise<ZipTextFile>[] = [];
  const streams: Array<{ terminate: () => void }> = [];
  let entryCount = 0;
  let totalDeclaredBytes = 0;
  let totalActualBytes = 0;
  let archiveError: Error | null = null;

  const fail = (error: Error) => {
    archiveError ??= error;
    for (const stream of streams) stream.terminate();
  };

  const unzipper = new Unzip((file) => {
    if (archiveError) return;
    if (++entryCount > maxEntries) {
      fail(new Error("В ZIP слишком много файлов (максимум 100)"));
      return;
    }

    const path = safeZipPath(file.name);
    const ext = path?.split(".").pop()?.toLowerCase() ?? "";
    if (!path || file.name.endsWith("/") || !TEXT_EXT.includes(ext)) return;

    if (
      file.originalSize !== undefined &&
      (!Number.isFinite(file.originalSize) || file.originalSize > maxFileBytes)
    ) {
      fail(new Error(`«${path}»: файл в ZIP превышает 1 МБ`));
      return;
    }
    totalDeclaredBytes += file.originalSize ?? 0;
    if (totalDeclaredBytes > maxTotalBytes) {
      fail(new Error("Распакованный объём ZIP превышает 4 МБ"));
      return;
    }

    const task = new Promise<ZipTextFile>((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      let fileBytes = 0;
      let settled = false;
      streams.push(file);
      file.ondata = (error, chunk, final) => {
        if (settled) return;
        if (error) {
          settled = true;
          fail(error);
          reject(error);
          return;
        }

        fileBytes += chunk.length;
        totalActualBytes += chunk.length;
        if (fileBytes > maxFileBytes || totalActualBytes > maxTotalBytes) {
          settled = true;
          const error = new Error("Распакованный объём ZIP превышает допустимый размер");
          fail(error);
          reject(error);
          return;
        }
        chunks.push(chunk);

        if (final) {
          settled = true;
          const bytes = new Uint8Array(fileBytes);
          let offset = 0;
          for (const part of chunks) {
            bytes.set(part, offset);
            offset += part.length;
          }
          resolve({ path, content: new TextDecoder().decode(bytes) });
        }
      };

      try {
        file.start();
      } catch (error) {
        settled = true;
        const reason = error instanceof Error ? error : new Error("Не удалось распаковать ZIP");
        fail(reason);
        reject(reason);
      }
    });
    tasks.push(task);
  });

  unzipper.register(UnzipPassThrough);
  unzipper.register(AsyncUnzipInflate);
  try {
    unzipper.push(data, true);
  } catch (error) {
    fail(error instanceof Error ? error : new Error("Повреждённый ZIP-архив"));
  }
  if (archiveError) throw archiveError;

  const files = await Promise.all(tasks);
  if (archiveError) throw archiveError;
  if (files.length === 0) throw new Error("В ZIP нет поддерживаемых текстовых файлов");

  const content = files.map((file) => formatTextFile(file.path, file.content)).join("\n\n");
  if (content.length > maxTextChars) {
    throw new Error("Текст файлов в ZIP превышает 150 000 символов");
  }
  return files;
}

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

  if (ext === "zip" || file.type === "application/zip" || file.type === "application/x-zip-compressed") {
    if (file.size > MAX_ZIP_BYTES) throw new Error(`«${file.name}»: ZIP больше 10 МБ`);
    const files = await extractZipFiles(new Uint8Array(await file.arrayBuffer()));
    return {
      kind: "text",
      name: file.name,
      content: files.map((entry) => formatTextFile(entry.path, entry.content)).join("\n\n"),
    };
  }

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
