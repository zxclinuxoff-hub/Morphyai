"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { Chat, StoredMessage, deleteChat, listChats, newChat, saveChat } from "@/lib/chatStore";
import { copyText, downloadBlob, downloadText } from "@/lib/download";
import { Attachment, MAX_ATTACHMENTS, formatTextFile, readAttachment } from "@/lib/attachments";
import { DEFAULT_SETTINGS, Settings, loadSettings, saveSettings } from "@/lib/settings";
import { extractFiles } from "@/lib/codeFiles";
import { buildZip } from "@/lib/zip";
import type { ChatMessage } from "@/lib/providers/openai";
import { Markdown } from "@/components/chat/Markdown";
import { Sidebar } from "@/components/chat/Sidebar";
import { SettingsPanel } from "@/components/chat/SettingsPanel";
import { readChatStream } from "@/lib/chatStream";

const MODEL_KEY = "coarena.model";
const COMPARE_KEY = "coarena.compareModel";
const FAV_KEY = "coarena.favorites";
const THEME_KEY = "coarena.theme";

const SUGGESTIONS = [
  "Объясни простыми словами, как работает нейросеть",
  "Напиши план изучения Python на 30 дней",
  "Помоги составить письмо клиенту с извинением",
  "Сравни React и Vue для нового проекта",
];

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const titleFrom = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 50);

// Минимальные типы Web Speech API. Браузеры отдают их под разными именами.
interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechCtor = new () => SpeechRec;

function getSpeechCtor(): SpeechCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Переводит историю в формат API. Изображения идут частями content, текст файлов уже внутри текста.
function toApiMessages(history: StoredMessage[], systemPrompt: string): ChatMessage[] {
  const out: ChatMessage[] = [];
  if (systemPrompt.trim()) out.push({ role: "system", content: systemPrompt.trim() });
  for (const m of history) {
    if (m.role === "user" && m.images && m.images.length > 0) {
      out.push({
        role: "user",
        content: [
          { type: "text", text: m.content || "Что на изображении?" },
          ...m.images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
        ],
      });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [compareMode, setCompareMode] = useState(false);
  const [compareModel, setCompareModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [status, setStatus] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pending, setPending] = useState<Attachment[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [dragging, setDragging] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOk, setVoiceOk] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<SpeechRec | null>(null);

  const active = chats.find((c) => c.id === activeId) ?? null;

  // Начальная загрузка: история, модели, настройки, тема, избранное
  useEffect(() => {
    setSettings(loadSettings());
    if (localStorage.getItem(THEME_KEY) === "light") setTheme("light");
    try {
      setFavorites(JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]"));
    } catch {
      setFavorites([]);
    }
    setVoiceOk(getSpeechCtor() !== null);

    (async () => {
      let list = await listChats();
      if (list.length === 0) {
        const c = newChat("");
        await saveChat(c);
        list = [c];
      }
      setChats(list);
      setActiveId(list[0].id);
      setReady(true);
    })().catch(() => setStatus("Не удалось открыть историю в браузере"));

    fetch("/api/models")
      .then((r) => r.json())
      .then((data) => {
        const list: string[] = Array.isArray(data?.data)
          ? data.data.map((m: { id: string }) => m.id).filter(Boolean)
          : [];
        setModels(list);
        const saved = localStorage.getItem(MODEL_KEY);
        setModel(saved && list.includes(saved) ? saved : list[0] ?? "");
        const savedCompare = localStorage.getItem(COMPARE_KEY);
        setCompareModel(savedCompare && list.includes(savedCompare) ? savedCompare : list[1] ?? list[0] ?? "");
        if (list.length === 0) setStatus("Список моделей недоступен");
      })
      .catch(() => setStatus("Не удалось загрузить модели"));
  }, []);

  useEffect(() => {
    if (model) localStorage.setItem(MODEL_KEY, model);
  }, [model]);

  useEffect(() => {
    if (compareModel) localStorage.setItem(COMPARE_KEY, compareModel);
  }, [compareModel]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // Сохраняем активный чат при старте и окончании ответа
  useEffect(() => {
    if (ready && active) void saveChat(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages.length]);

  // Ctrl+K открывает панель и ставит фокус в поиск
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setDrawer(true);
        setTimeout(() => searchRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const patchChat = useCallback((id: string, fn: (c: Chat) => Chat) => {
    setChats((prev) => prev.map((c) => (c.id === id ? fn(c) : c)));
  }, []);

  function updateSettings(next: Settings) {
    setSettings(next);
    saveSettings(next);
  }

  function toggleFavorite(name: string) {
    const next = favorites.includes(name) ? favorites.filter((x) => x !== name) : [...favorites, name];
    setFavorites(next);
    localStorage.setItem(FAV_KEY, JSON.stringify(next));
  }

  function setBotMessage(chatId: string, botId: string, content: string, error = false) {
    patchChat(chatId, (c) => ({
      ...c,
      updatedAt: Date.now(),
      messages: c.messages.map((m) => (m.id === botId ? { ...m, content, error } : m)),
    }));
  }

  // Один запрос к одной модели. Занятость и отмену ведёт вызывающий код.
  async function generate(
    chatId: string,
    history: StoredMessage[],
    botId: string,
    modelName: string,
    controller: AbortController,
  ) {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelName,
          messages: toApiMessages(history, settings.systemPrompt),
          temperature: settings.temperature,
          max_tokens: settings.maxTokens,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        const hint = data.retryAfterSeconds ? ` Попробуйте через ${data.retryAfterSeconds} с.` : "";
        setBotMessage(chatId, botId, (data.error ?? "Ошибка запроса") + hint, true);
        return;
      }

      let acc = "";
      const hasContent = await readChatStream(res.body, (delta) => {
        acc += delta;
        setBotMessage(chatId, botId, acc);
      });

      if (!hasContent) setBotMessage(chatId, botId, "Пустой ответ модели", true);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setStatus("Остановлено");
      } else {
        setBotMessage(chatId, botId, "Соединение прервано", true);
      }
    }
  }

  // Запускает одну или несколько моделей параллельно и ведёт занятость.
  async function runTurn(chatId: string, history: StoredMessage[], bots: StoredMessage[]) {
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setStatus("");
    try {
      await Promise.all(bots.map((b) => generate(chatId, history, b.id, b.model ?? model, controller)));
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  async function send() {
    const text = input.trim();
    if ((!text && pending.length === 0) || busy || !model || !active) return;

    const textFiles = pending.filter((a): a is Extract<Attachment, { kind: "text" }> => a.kind === "text");
    const images = pending.filter((a): a is Extract<Attachment, { kind: "image" }> => a.kind === "image");
    const fullText = [text, ...textFiles.map((f) => formatTextFile(f.name, f.content))]
      .filter(Boolean)
      .join("\n\n");

    const userMsg: StoredMessage = {
      id: uid(),
      role: "user",
      content: fullText,
      files: [...textFiles, ...images].map((f) => f.name),
      images: images.length ? images.map((i) => i.dataUrl) : undefined,
    };

    const targets = compareMode && compareModel && compareModel !== model ? [model, compareModel] : [model];
    const bots: StoredMessage[] = targets.map((m) => ({ id: uid(), role: "assistant", content: "", model: m }));
    const chatId = active.id;
    const history = [...active.messages, userMsg];

    patchChat(chatId, (c) => ({
      ...c,
      model,
      title: c.messages.length === 0 ? titleFrom(text || userMsg.files?.[0] || "Чат") || c.title : c.title,
      updatedAt: Date.now(),
      messages: [...history, ...bots],
    }));
    setInput("");
    setPending([]);
    await runTurn(chatId, history, bots);
  }

  // Повтор последнего хода: перегенерирует все ответы последнего запроса.
  async function regenerate() {
    if (!active || busy) return;
    const msgs = active.messages;
    let lastUser = msgs.length - 1;
    while (lastUser >= 0 && msgs[lastUser].role !== "user") lastUser--;
    if (lastUser < 0) return;
    const history = msgs.slice(0, lastUser + 1);
    const bots = msgs.slice(lastUser + 1).filter((m) => m.role === "assistant");
    if (bots.length === 0) return;
    const reset = bots.map((b) => ({ ...b, content: "", error: false, feedback: undefined }));
    patchChat(active.id, (c) => ({ ...c, updatedAt: Date.now(), messages: [...history, ...reset] }));
    await runTurn(active.id, history, reset);
  }

  async function onPickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = MAX_ATTACHMENTS - pending.length;
    if (room <= 0) {
      setStatus(`Можно прикрепить не больше ${MAX_ATTACHMENTS} файлов`);
      return;
    }
    const added: Attachment[] = [];
    const errors: string[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      try {
        added.push(await readAttachment(file));
      } catch (err) {
        errors.push((err as Error).message);
      }
    }
    if (added.length) setPending((prev) => [...prev, ...added]);
    setStatus(errors.join(". "));
    if (fileRef.current) fileRef.current.value = "";
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setDragging(true);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    void onPickFiles(e.dataTransfer.files);
  }

  function toggleVoice() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor = getSpeechCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "ru-RU";
    rec.interimResults = true;
    rec.continuous = false;
    const base = input.trim();
    rec.onresult = (e) => {
      let spoken = "";
      for (let i = 0; i < e.results.length; i++) spoken += e.results[i][0].transcript;
      setInput([base, spoken].filter(Boolean).join(" "));
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
    };
    rec.onerror = () => {
      setListening(false);
      recRef.current = null;
      setStatus("Голосовой ввод не сработал. Проверьте доступ к микрофону");
    };
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  function rate(msgId: string, rating: "up" | "down") {
    if (!active || busy) return;
    const current = active.messages.find((m) => m.id === msgId)?.feedback;
    const next = current === rating ? undefined : rating;
    const updated: Chat = {
      ...active,
      messages: active.messages.map((m) => (m.id === msgId ? { ...m, feedback: next } : m)),
    };
    setChats((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    void saveChat(updated);
    if (next) {
      void fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: active.model || model, rating: next }),
      }).catch(() => {});
    }
  }

  async function copyMessage(m: StoredMessage) {
    await copyText(m.content).catch(() => {});
    setCopiedId(m.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  function downloadZip(m: StoredMessage) {
    const files = extractFiles(m.content);
    if (files.length === 0) return;
    downloadBlob(`answer-${m.id}.zip`, buildZip(files));
  }

  async function handleNew() {
    if (busy) return;
    const c = newChat(model);
    await saveChat(c);
    setChats((prev) => [c, ...prev]);
    setActiveId(c.id);
    setDrawer(false);
    setInput("");
    setPending([]);
  }

  function handleSelect(id: string) {
    setActiveId(id);
    setDrawer(false);
  }

  async function handleRename(id: string) {
    const chat = chats.find((c) => c.id === id);
    if (!chat || (busy && id === activeId)) return;
    const title = window.prompt("Название чата", chat.title)?.trim();
    if (!title) return;
    const updated = { ...chat, title: title.slice(0, 120), updatedAt: Date.now() };
    setChats((prev) => prev.map((c) => (c.id === id ? updated : c)));
    await saveChat(updated);
  }

  async function handleDelete(id: string) {
    if (busy && id === activeId) return;
    const chat = chats.find((c) => c.id === id);
    if (!chat || !window.confirm(`Удалить чат «${chat.title}»?`)) return;
    await deleteChat(id);
    const rest = chats.filter((c) => c.id !== id);
    if (rest.length === 0) {
      const c = newChat(model);
      await saveChat(c);
      setChats([c]);
      setActiveId(c.id);
    } else {
      setChats(rest);
      if (activeId === id) setActiveId(rest[0].id);
    }
  }

  function handleExport(id: string, format: "md" | "json") {
    const chat = chats.find((c) => c.id === id);
    if (!chat) return;
    const safe = chat.title.replace(/[\\/:*?"<>|]+/g, "_") || "chat";
    if (format === "json") {
      downloadText(`${safe}.json`, JSON.stringify(chat, null, 2), "application/json;charset=utf-8");
      return;
    }
    const body = chat.messages
      .map((m) => `**${m.role === "user" ? "Вы" : `Модель${m.model ? ` (${m.model})` : ""}`}:**\n\n${m.content}`)
      .join("\n\n---\n\n");
    downloadText(`${safe}.md`, `# ${chat.title}\n\n${body}\n`, "text/markdown;charset=utf-8");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  // Модели: избранные сверху, порядок внутри групп сохраняется
  const sortedModels = [...models].sort(
    (a, b) => Number(favorites.includes(b)) - Number(favorites.includes(a)),
  );

  const q = query.trim().toLowerCase();
  const visible = q
    ? chats.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.messages.some((m) => m.content.toLowerCase().includes(q)),
      )
    : chats;

  const msgs = active?.messages ?? [];
  let lastUserIdx = msgs.length - 1;
  while (lastUserIdx >= 0 && msgs[lastUserIdx].role !== "user") lastUserIdx--;
  const lastIdx = msgs.length - 1;
  const canSend = (input.trim().length > 0 || pending.length > 0) && !!model && ready;

  return (
    <div className="shell">
      <Sidebar
        chats={visible}
        activeId={activeId}
        query={query}
        onQuery={setQuery}
        onSelect={handleSelect}
        onNew={handleNew}
        onRename={handleRename}
        onDelete={handleDelete}
        onExport={handleExport}
        open={drawer}
        onClose={() => setDrawer(false)}
        searchRef={searchRef}
      />

      <div
        className={`app ${dragging ? "dragging" : ""}`}
        onDragOver={onDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <header className="topbar">
          <button type="button" className="menu-btn" aria-label="Чаты" onClick={() => setDrawer(true)}>☰</button>
          <div className="brand">
            <span className="logo">M</span>
            <span className="brand-name">morphyAI</span>
          </div>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={busy || models.length === 0}
            aria-label="Модель"
          >
            {models.length === 0 && <option value="">Нет моделей</option>}
            {sortedModels.map((m) => (
              <option key={m} value={m}>{favorites.includes(m) ? "★ " : ""}{m}</option>
            ))}
          </select>
          <button
            type="button"
            className={`fav-btn ${favorites.includes(model) ? "on" : ""}`}
            aria-label="В избранное"
            disabled={!model}
            onClick={() => toggleFavorite(model)}
          >
            {favorites.includes(model) ? "★" : "☆"}
          </button>
          <button
            type="button"
            className={`mode-btn ${compareMode ? "on" : ""}`}
            aria-label="Сравнить модели"
            title="Сравнить две модели"
            onClick={() => setCompareMode((v) => !v)}
          >
            ⇄
          </button>
          <button type="button" className="settings-btn" aria-label="Настройки" onClick={() => setShowSettings(true)}>⚙</button>
          <button
            type="button"
            className="theme-btn"
            aria-label="Сменить тему"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </header>

        {compareMode && (
          <div className="compare-bar">
            <span>Сравнить с</span>
            <select
              value={compareModel}
              onChange={(e) => setCompareModel(e.target.value)}
              disabled={busy}
              aria-label="Вторая модель"
            >
              {sortedModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        )}

        <main className="messages">
          {msgs.length === 0 && (
            <div className="empty">
              <div className="empty-logo">M</div>
              <h1>Чем займёмся?</h1>
              <p>Напишите вопрос, прикрепите файл или перетащите его в окно</p>
              <div className="suggest">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="suggest-chip" onClick={() => setInput(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {msgs.map((m, idx) => {
            if (m.role === "user") {
              return (
                <div key={m.id} className="msg user">
                  {m.images && m.images.length > 0 && (
                    <div className="msg-images">
                      {m.images.map((src, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={src} alt="Прикреплённое изображение" />
                      ))}
                    </div>
                  )}
                  {m.content.split("\n\nФайл: ")[0]}
                  {m.files && m.files.length > 0 && (
                    <div className="msg-files">
                      {m.files.map((f, i) => (
                        <span key={i}>{f}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            const lastTurn = idx > lastUserIdx;
            const streaming = busy && lastTurn && !m.content;
            const streamingNow = busy && lastTurn;
            const files = !streamingNow && m.content ? extractFiles(m.content) : [];
            return (
              <div key={m.id} className={`msg assistant ${m.error ? "error" : ""}`}>
                {m.model && <div className="msg-model">{m.model}</div>}
                {m.content ? <Markdown content={m.content} /> : streaming ? <TypingDots /> : null}
                {!streamingNow && m.content && (
                  <div className="msg-actions">
                    <button type="button" onClick={() => copyMessage(m)}>
                      {copiedId === m.id ? "Скопировано" : "Копировать"}
                    </button>
                    {!m.error && (
                      <>
                        <button type="button" className={m.feedback === "up" ? "on" : ""} onClick={() => rate(m.id, "up")}>👍</button>
                        <button type="button" className={m.feedback === "down" ? "on" : ""} onClick={() => rate(m.id, "down")}>👎</button>
                      </>
                    )}
                    {files.length >= 2 && (
                      <button type="button" onClick={() => downloadZip(m)}>ZIP ({files.length})</button>
                    )}
                    {lastTurn && idx === lastIdx && (
                      <button type="button" onClick={regenerate}>Повторить</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {status && <p style={{ color: "var(--muted)", textAlign: "center" }}>{status}</p>}
          <div ref={bottomRef} />
        </main>

        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {pending.length > 0 && (
            <div className="attach-row">
              {pending.map((a, i) => (
                <span key={i} className="chip">
                  {a.kind === "image" && <img src={a.dataUrl} alt="" />}
                  <span>{a.name}</span>
                  <button
                    type="button"
                    aria-label="Убрать"
                    onClick={() => setPending((prev) => prev.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            accept=".txt,.md,.csv,.tsv,.json,.js,.jsx,.ts,.tsx,.py,.html,.css,.xml,.yml,.yaml,.sql,.sh,.java,.go,.rs,.c,.cpp,.h,.cs,.php,.rb,.swift,.kt,.log,.pdf,.png,.jpg,.jpeg,.webp,.gif"
            onChange={(e) => void onPickFiles(e.target.files)}
          />
          <button
            type="button"
            className="attach-btn"
            aria-label="Прикрепить файл"
            disabled={busy || !ready}
            onClick={() => fileRef.current?.click()}
          >
            📎
          </button>
          {voiceOk && (
            <button
              type="button"
              className={`voice-btn ${listening ? "on" : ""}`}
              aria-label="Голосовой ввод"
              disabled={busy || !ready}
              onClick={toggleVoice}
            >
              🎙
            </button>
          )}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={listening ? "Говорите..." : "Сообщение"}
            rows={1}
            disabled={busy || !ready}
          />
          {busy ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              style={{ background: "var(--surface-2)", color: "var(--text)" }}
            >
              Стоп
            </button>
          ) : (
            <button type="submit" disabled={!canSend}>
              Отправить
            </button>
          )}
        </form>
      </div>

      {showSettings && (
        <SettingsPanel value={settings} onChange={updateSettings} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

function TypingDots() {
  return (
    <span className="typing">
      <span />
      <span />
      <span />
    </span>
  );
}
