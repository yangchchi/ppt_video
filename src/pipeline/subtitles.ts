import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { burnSubtitleBin, burnSubtitleSource } from "../config.js";
import { captureCommand, runCommand } from "./command.js";
import type { HighlightRegion } from "./highlight.js";

async function ensureSubtitleRenderer(): Promise<void> {
  await fs.mkdir(path.dirname(burnSubtitleBin), { recursive: true });
  const [sourceStat, binStat] = await Promise.all([
    fs.stat(burnSubtitleSource),
    fs.stat(burnSubtitleBin).catch(() => null),
  ]);
  if (!binStat || binStat.mtimeMs < sourceStat.mtimeMs) {
    await runCommand("swiftc", ["-O", burnSubtitleSource, "-o", burnSubtitleBin], 120_000);
  }
}

export function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      filePath,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      reject(error.code === "ENOENT" ? new Error("找不到命令 ffprobe。") : error);
    });
    child.on("close", (code) => {
      const duration = Number(stdout.trim());
      if (code === 0 && Number.isFinite(duration) && duration > 0) resolve(duration);
      else reject(new Error(`无法读取音频时长：${stderr.trim().slice(-300) || filePath}`));
    });
  });
}

export async function wrapSubtitleLines(imagePath: string, text: string, workDir: string): Promise<string[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  await ensureSubtitleRenderer();
  await fs.mkdir(workDir, { recursive: true });
  const textPath = path.join(workDir, "wrap.txt");
  await fs.writeFile(textPath, trimmed);
  const stdout = await captureCommand(burnSubtitleBin, ["lines", imagePath, textPath], 60_000);
  const lines = JSON.parse(stdout) as unknown;
  if (!Array.isArray(lines) || lines.some((line) => typeof line !== "string")) {
    throw new Error("字幕分行结果无效。");
  }
  return lines.filter((line) => line.trim().length > 0);
}

export async function burnSubtitleLine(
  imagePath: string,
  line: string,
  outputPath: string,
  regions: HighlightRegion[] = [],
  style: "bar" | "board" = "bar",
): Promise<void> {
  await ensureSubtitleRenderer();
  const textPath = `${outputPath}.txt`;
  await fs.writeFile(textPath, line);
  const args = [imagePath, outputPath, textPath, style];
  if (regions.length > 0) {
    const boxPath = `${outputPath}.boxes.json`;
    await fs.writeFile(boxPath, JSON.stringify(regions.map((region) => ({
      x: region.x,
      y: region.y,
      w: region.w,
      h: region.h,
    }))));
    args.push(boxPath);
  }
  await runCommand(burnSubtitleBin, args, 60_000);
}
