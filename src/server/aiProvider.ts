import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { serverEnv } from "~/env.server";
import { typo } from "~/lib";

export type AiModelTier = "large" | "standard" | "fast";

interface AiProcessOptions {
  cwd: string;
  prompt: string;
  timeoutMs: number;
  tier: AiModelTier;
  mode: "read-only" | "workspace-write";
  outputFile?: string;
}

const CLAUDE_MODELS: Record<AiModelTier, string> = {
  large: "opus",
  standard: "sonnet",
  fast: "haiku",
};

function codexModel(tier: AiModelTier): string | undefined {
  if (tier === "large") return serverEnv.CODEX_GENERATION_MODEL;
  if (tier === "fast") return serverEnv.CODEX_FAST_MODEL;
  return serverEnv.CODEX_CHAT_MODEL;
}

// Дочерние shell-команды модели не должны видеть секреты БД, оплаты и авторизации приложения.
// Самому CLI оставляем только окружение, необходимое для запуска, сети и входа в провайдера.
function restrictedCodexEnv(): NodeJS.ProcessEnv {
  const allowedNames = [
    "PATH",
    "HOME",
    "CODEX_HOME",
    "OPENAI_API_KEY",
    "CODEX_ACCESS_TOKEN",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "NODE_EXTRA_CA_CERTS",
    "LANG",
    "LC_ALL",
    "TMPDIR",
  ];
  const env: NodeJS.ProcessEnv = {};
  for (const name of allowedNames) {
    const value = process.env[name];
    if (value) env[name] = value;
  }
  return env;
}

function runProcess(
  command: string,
  args: string[],
  options: AiProcessOptions,
  env: NodeJS.ProcessEnv,
  promptViaStdin: boolean,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
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
    }, options.timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(typo("Превышено время ответа ИИ-провайдера.")));
        return;
      }
      if (code !== 0) {
        const details = stderr.trim().slice(0, 1000);
        reject(new Error(typo(`ИИ-провайдер завершился с кодом ${code ?? "unknown"}${details ? `: ${details}` : ""}`)));
        return;
      }
      resolve(stdout);
    });

    child.stdin?.end(promptViaStdin ? options.prompt : undefined);
  });
}

function claudeArgs(options: AiProcessOptions): string[] {
  let toolArgs: string[];
  if (options.mode === "workspace-write") {
    toolArgs = ["--permission-mode", "acceptEdits", "--allowedTools", "Read,Write,Edit,Bash,Grep,Glob"];
  } else if (options.cwd === tmpdir()) {
    toolArgs = ["--tools", ""];
  } else {
    toolArgs = ["--allowedTools", "Read"];
  }
  return ["-p", options.prompt, "--model", CLAUDE_MODELS[options.tier], ...toolArgs];
}

function codexArgs(options: AiProcessOptions): string[] {
  const args = [
    "exec",
    "--sandbox",
    options.mode,
    "--cd",
    options.cwd,
    "--skip-git-repo-check",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--color",
    "never",
    "--config",
    'shell_environment_policy.inherit="none"',
  ];
  const model = codexModel(options.tier);
  if (model) args.push("--model", model);
  // Разговорным запросам достаточно финального текста: отключаем shell, чтобы пользовательский
  // промпт не мог заставить агента читать файлы контейнера.
  if (options.mode === "read-only") args.push("--disable", "shell_tool");
  if (options.outputFile) args.push("--output-last-message", options.outputFile);
  // Явный stdin-маркер ставим после опций, чтобы prompt любого размера не попадал в argv.
  args.push("-");
  return args;
}

function runProvider(options: AiProcessOptions): Promise<string> {
  if (serverEnv.AI_PROVIDER === "claude") {
    return runProcess("claude", claudeArgs(options), options, process.env, false);
  }
  return runProcess("codex", codexArgs(options), options, restrictedCodexEnv(), true);
}

export interface RunAiTextOptions {
  tier?: AiModelTier;
  timeoutMs: number;
}

/** Запускает ИИ без записи в рабочую папку и возвращает только финальный текст модели. */
export async function runAiText(prompt: string, options: RunAiTextOptions): Promise<string> {
  const outputDir = await mkdtemp(path.join(tmpdir(), "memoization-ai-"));
  const outputFile = path.join(outputDir, "response.txt");
  try {
    const stdout = await runProvider({
      cwd: tmpdir(),
      prompt,
      timeoutMs: options.timeoutMs,
      tier: options.tier ?? "standard",
      mode: "read-only",
      outputFile: serverEnv.AI_PROVIDER === "codex" ? outputFile : undefined,
    });
    let text = stdout;
    if (serverEnv.AI_PROVIDER === "codex") {
      try {
        text = await readFile(outputFile, "utf8");
      } catch {
        throw new Error(typo("Codex не сохранил финальный ответ. Проверьте версию и авторизацию CLI."));
      }
    }
    if (!text.trim()) throw new Error(typo("ИИ-провайдер вернул пустой ответ."));
    return text.trim();
  } finally {
    await rm(outputDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Запускает агентную генерацию в изолированной папке и читает созданный моделью файл. */
export async function runAiFile(
  jobDir: string,
  prompt: string,
  outputName: string,
  timeoutMs: number,
): Promise<string> {
  await runProvider({
    cwd: jobDir,
    prompt,
    timeoutMs,
    tier: "large",
    mode: "workspace-write",
  });
  try {
    return await readFile(path.join(jobDir, outputName), "utf8");
  } catch {
    throw new Error(typo(`ИИ-провайдер не создал ${outputName}. Проверьте материалы и авторизацию CLI в контейнере.`));
  }
}
