export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  feedback?: "up" | "down";
  images?: string[];
  files?: string[];
  model?: string;
  backgroundTaskId?: string;
}

export interface Chat {
  id: string;
  title: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
}

const DB_NAME = "morphyai";
const STORE = "chats";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, make: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = make(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function listChats(): Promise<Chat[]> {
  const all = await run<Chat[]>("readonly", (s) => s.getAll());
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveChat(chat: Chat): Promise<unknown> {
  return run("readwrite", (s) => s.put(chat));
}

export function deleteChat(id: string): Promise<unknown> {
  return run("readwrite", (s) => s.delete(id));
}

export function newChat(model: string): Chat {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "Новый чат",
    model,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}
