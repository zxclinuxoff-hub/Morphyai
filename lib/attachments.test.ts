import { strict as assert } from "node:assert";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";
import { extractZipFiles } from "./attachments";

test("extracts supported text files from ZIP and ignores binary files", async () => {
  const archive = zipSync({
    "src/main.ts": strToU8("export const answer = 42;"),
    "assets/logo.png": strToU8("not actually an image"),
  });

  assert.deepEqual(await extractZipFiles(archive), [
    { path: "src/main.ts", content: "export const answer = 42;" },
  ]);
});

test("rejects archives with no supported text files", async () => {
  const archive = zipSync({ "../secret.txt": strToU8("text") });

  await assert.rejects(extractZipFiles(archive), /нет поддерживаемых текстовых файлов/);
});

test("rejects a ZIP entry larger than the per-file limit before reading it", async () => {
  const archive = zipSync({ "large.txt": new Uint8Array(1_000_001) });

  await assert.rejects(extractZipFiles(archive), /превышает 1 МБ/);
});
