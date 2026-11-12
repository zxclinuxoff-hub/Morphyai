import type { ZipEntry } from "./zip";

// Ищет блоки вида ```lang:путь/файл.ext и возвращает файлы для архива.
// Блоки без пути (```ts) сюда не попадают.
export function extractFiles(markdown: string): ZipEntry[] {
  const files: ZipEntry[] = [];
  const re = /^```([^\n`]*)\n([\s\S]*?)^```[ \t]*$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    const info = match[1].trim();
    const colon = info.indexOf(":");
    if (colon === -1) continue;
    const path = info.slice(colon + 1).trim();
    if (!path) continue;
    files.push({ path, content: match[2].replace(/\n$/, "") });
  }
  return files;
}
