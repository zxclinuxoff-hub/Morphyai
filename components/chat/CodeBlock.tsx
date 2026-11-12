"use client";

import { useState } from "react";
import hljs from "highlight.js/lib/common";
import { LANG_EXT, copyText, downloadText } from "@/lib/download";

// Формат "lang:path/file.ext" задаёт имя файла для скачивания.
export function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const colon = lang.indexOf(":");
  const langName = (colon === -1 ? lang : lang.slice(0, colon)).toLowerCase();
  const filePath = colon === -1 ? "" : lang.slice(colon + 1);

  const highlighted = langName && hljs.getLanguage(langName)
    ? hljs.highlight(code, { language: langName, ignoreIllegals: true }).value
    : null;

  const [copied, setCopied] = useState(false);
  const baseName = filePath ? filePath.split("/").pop() ?? filePath : "";
  const fileName = baseName || `snippet.${LANG_EXT[langName] ?? (langName || "txt")}`;

  async function onCopy() {
    await copyText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="codeblock">
      <div className="codebar">
        <span>{filePath || langName || "text"}</span>
        <div>
          <button type="button" onClick={onCopy}>{copied ? "Скопировано" : "Копировать"}</button>
          <button type="button" onClick={() => downloadText(fileName, code)}>Скачать</button>
        </div>
      </div>
      <pre>
        {highlighted !== null ? (
          <code dangerouslySetInnerHTML={{ __html: highlighted }} />
        ) : (
          <code>{code}</code>
        )}
      </pre>
    </div>
  );
}
