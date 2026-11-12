export const LANG_EXT: Record<string, string> = {
  ts: "ts", tsx: "tsx", typescript: "ts", js: "js", jsx: "jsx", javascript: "js",
  py: "py", python: "py", json: "json", html: "html", xml: "xml", css: "css", scss: "scss",
  md: "md", markdown: "md", sh: "sh", bash: "sh", shell: "sh", sql: "sql",
  yaml: "yml", yml: "yml", java: "java", go: "go", rust: "rs", rs: "rs",
  cpp: "cpp", c: "c", csharp: "cs", cs: "cs", php: "php", ruby: "rb", rb: "rb",
  swift: "swift", kotlin: "kt", txt: "txt", text: "txt",
};

export function copyText(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(name: string, content: string, mime = "text/plain;charset=utf-8"): void {
  downloadBlob(name, new Blob([content], { type: mime }));
}
