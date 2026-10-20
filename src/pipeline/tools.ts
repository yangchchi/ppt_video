import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const sofficeCandidates = [
  process.env.SOFFICE_PATH,
  "soffice",
  "libreoffice",
  "/usr/bin/soffice",
  "/usr/bin/libreoffice",
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
].filter((value): value is string => Boolean(value));

function onPath(command: string): boolean {
  const result = spawnSync("sh", ["-c", `command -v ${JSON.stringify(command)}`], { encoding: "utf8" });
  return result.status === 0 && Boolean(result.stdout.trim());
}

async function isUsable(filePath: string): Promise<boolean> {
  if (!path.isAbsolute(filePath)) return onPath(filePath);
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveSoffice(): Promise<string> {
  for (const candidate of sofficeCandidates) {
    if (await isUsable(candidate)) return candidate;
  }
  throw new Error(
    "找不到 LibreOffice（soffice）。请安装 LibreOffice，或设置环境变量 SOFFICE_PATH，或使用项目提供的 Docker 镜像。",
  );
}
