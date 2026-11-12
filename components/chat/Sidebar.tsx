"use client";

import type { RefObject } from "react";
import type { Chat } from "@/lib/chatStore";

interface Props {
  chats: Chat[];
  activeId: string | null;
  query: string;
  onQuery: (q: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string, format: "md" | "json") => void;
  open: boolean;
  onClose: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
}

export function Sidebar(p: Props) {
  return (
    <>
      <div className={`scrim ${p.open ? "show" : ""}`} onClick={p.onClose} />
      <aside className={`sidebar ${p.open ? "open" : ""}`}>
        <div className="side-brand">
          <span className="logo">M</span>
          <span className="brand-name">morphyAI</span>
        </div>
        <button type="button" className="ghost" onClick={p.onNew}>+ Новый чат</button>
        <input
          ref={p.searchRef}
          className="search"
          placeholder="Поиск (Ctrl+K)"
          value={p.query}
          onChange={(e) => p.onQuery(e.target.value)}
        />
        <ul className="chat-list">
          {p.chats.map((c) => (
            <li key={c.id} className={`chat-item ${c.id === p.activeId ? "active" : ""}`}>
              <button type="button" className="chat-title" onClick={() => p.onSelect(c.id)}>
                {c.title || "Без названия"}
              </button>
              <div className="chat-tools">
                <button type="button" className="icon" title="Переименовать" onClick={() => p.onRename(c.id)}>Имя</button>
                <button type="button" className="icon" title="Экспорт в Markdown" onClick={() => p.onExport(c.id, "md")}>MD</button>
                <button type="button" className="icon" title="Экспорт в JSON" onClick={() => p.onExport(c.id, "json")}>JSON</button>
                <button type="button" className="icon danger" title="Удалить" onClick={() => p.onDelete(c.id)}>Удалить</button>
              </div>
            </li>
          ))}
          {p.chats.length === 0 && <li style={{ color: "var(--muted)", padding: 8, fontSize: 14 }}>Ничего не найдено</li>}
        </ul>
      </aside>
    </>
  );
}
