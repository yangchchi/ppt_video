import { spawn, type SpawnOptions } from "node:child_process";

export type CommandOptions = {
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
};

export function runCommand(
  command: string,
  args: string[],
  timeoutMsOrOptions: number | CommandOptions = 180_000,
): Promise<void> {
  return captureCommand(command, args, timeoutMsOrOptions).then(() => undefined);
}

export function captureCommand(
  command: string,
  args: string[],
  timeoutMsOrOptions: number | CommandOptions = 180_000,
): Promise<string> {
  const options: CommandOptions = typeof timeoutMsOrOptions === "number"
    ? { timeoutMs: timeoutMsOrOptions }
    : timeoutMsOrOptions;
  const timeoutMs = options.timeoutMs ?? 180_000;
  return new Promise((resolve, reject) => {
    const spawnOptions: SpawnOptions = {
      stdio: ["ignore", "pipe", "pipe"],
      env: options.env ? { ...process.env, ...options.env } : undefined,
    };
    const child = spawn(command, args, spawnOptions);
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} 超时。`));
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(error.code === "ENOENT" ? new Error(`找不到命令 ${command}。`) : error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} 失败：${stderr.trim().slice(-500) || `退出码 ${code}`}`));
    });
  });
}
