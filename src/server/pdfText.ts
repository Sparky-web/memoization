import { spawn } from "node:child_process";

import { typo } from "~/lib";

const PDF_TIMEOUT_MS = 60_000;

/** Извлекает текст PDF системным pdftotext, чтобы результат не зависел от инструментов ИИ-провайдера. */
export function extractPdfText(filePath: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("pdftotext", ["-layout", "-enc", "UTF-8", filePath, "-"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, PDF_TIMEOUT_MS);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(typo("Превышено время чтения PDF.")));
        return;
      }
      if (code !== 0) {
        const details = stderr.trim().slice(0, 500);
        reject(new Error(typo(`Не удалось прочитать PDF${details ? `: ${details}` : ""}`)));
        return;
      }
      if (!stdout.trim()) {
        reject(new Error(typo("В PDF не найден текст. Возможно, это скан без текстового слоя.")));
        return;
      }
      resolve(stdout);
    });
  });
}
