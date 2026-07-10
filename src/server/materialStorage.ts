import { mkdir, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

// Хранилище загруженных материалов: файлы лежат на диске (data/materials/<examId>/…),
// метаданные — в модели Material (storagePath хранится относительным к корню приложения).

const MATERIALS_ROOT = path.join("data", "materials");

/** Имя файла без опасных символов: не-ASCII заменяются «_», длина ограничена. */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  return cleaned || "file";
}

/** Абсолютный путь к файлу материала по его storagePath из БД. */
export function materialAbsolutePath(storagePath: string): string {
  return path.resolve(process.cwd(), storagePath);
}

/** Сохраняет файл материала на диск, возвращает относительный storagePath для записи Material. */
export async function saveMaterialFile(examId: string, storedName: string, bytes: Buffer): Promise<string> {
  const storagePath = path.join(MATERIALS_ROOT, examId, storedName);
  await mkdir(path.dirname(materialAbsolutePath(storagePath)), { recursive: true });
  await writeFile(materialAbsolutePath(storagePath), bytes);
  return storagePath;
}

/** Удаляет файл материала с диска (запись Material удаляется отдельно). */
export async function deleteMaterialFile(storagePath: string): Promise<void> {
  await unlink(materialAbsolutePath(storagePath)).catch(() => undefined);
}

/** Удаляет каталог материалов экзамена целиком — вместе с экзаменом файлы больше не нужны. */
export function cleanupExamMaterials(examId: string): void {
  void rm(path.resolve(process.cwd(), MATERIALS_ROOT, examId), { recursive: true, force: true }).catch(() => undefined);
}
