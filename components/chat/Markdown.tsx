"use client";

import { Children, isValidElement, ReactElement, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { CodeBlock } from "./CodeBlock";

type CodeChild = ReactElement<{ className?: string; children?: ReactNode }>;

// react-markdown без rehype-raw не пропускает сырой HTML, поэтому XSS через ответ модели исключён.
export function Markdown({ content }: { content: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          pre({ children }) {
            const child = Children.toArray(children).find(isValidElement) as CodeChild | undefined;
            const className = child?.props.className ?? "";
            const lang = /language-(\S+)/.exec(className)?.[1] ?? "";
            const code = String(child?.props.children ?? "").replace(/\n$/, "");
            return <CodeBlock code={code} lang={lang} />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
