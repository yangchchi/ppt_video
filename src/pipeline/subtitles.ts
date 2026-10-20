import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { rootDir } from "../config.js";
import type { HighlightRegion } from "./highlight.js";

let fontFamily: string | null = null;

const fontCandidates = [
  process.env.SUBTITLE_FONT,
  path.join(rootDir, "assets", "fonts", "NotoSansSC-Regular.otf"),
  path.join(rootDir, "assets", "fonts", "NotoSansSC-Regular.ttf"),
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf",
  "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
  "/System/Library/Fonts/PingFang.ttc",
  "/System/Library/Fonts/STHeiti Light.ttc",
  "/Library/Fonts/Arial Unicode.ttf",
].filter((value): value is string => Boolean(value));

async function ensureFont(): Promise<string> {
  if (fontFamily) return fontFamily;
  for (const candidate of fontCandidates) {
    try {
      await fs.access(candidate);
      const family = "MotionDeckSans";
      GlobalFonts.registerFromPath(candidate, family);
      fontFamily = family;
      return family;
    } catch {
      // try next
    }
  }
  throw new Error(
    "找不到中文字体。请将 NotoSansSC-Regular.otf 放到 assets/fonts/，设置 SUBTITLE_FONT，或安装 fonts-noto-cjk（Docker 镜像已包含）。",
  );
}

function wrapParagraph(paragraph: string, font: string, fontSize: number, maxWidth: number): string[] {
  if (!paragraph) return [""];
  const canvas = createCanvas(1, 1);
  const ctx = canvas.getContext("2d");
  ctx.font = `${fontSize}px "${font}"`;
  const lines: string[] = [];
  let current = "";
  for (const character of paragraph) {
    const next = current + character;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = character;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function wrapTextLines(text: string, width: number, font: string): string[] {
  const fontSize = Math.max(28, Math.floor(width / 48));
  const marginX = width * 0.06;
  const padX = fontSize * 0.55;
  const maxWidth = width - marginX * 2 - padX * 2;
  const paragraphs = text.split("\n");
  const lines = paragraphs.flatMap((paragraph) => wrapParagraph(paragraph, font, fontSize, maxWidth))
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0 && text.trim()) {
    return [text.replaceAll("\n", "")];
  }
  return lines;
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

export async function wrapSubtitleLines(imagePath: string, text: string, _workDir: string): Promise<string[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const font = await ensureFont();
  const image = await loadImage(imagePath);
  return wrapTextLines(trimmed, image.width, font);
}

function drawHighlights(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  width: number,
  height: number,
  regions: HighlightRegion[],
): void {
  if (regions.length === 0) return;
  const weight = Math.max(6, width / 280);
  ctx.strokeStyle = "rgba(245, 140, 20, 0.95)";
  ctx.lineWidth = weight;
  for (const region of regions) {
    const x = region.x * width - weight;
    const y = (1 - region.y - region.h) * height - weight;
    const w = region.w * width + weight * 2;
    const h = region.h * height + weight * 2;
    const radius = Math.min(18, h / 4);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.stroke();
  }
}

export async function burnSubtitleLine(
  imagePath: string,
  line: string,
  outputPath: string,
  regions: HighlightRegion[] = [],
  style: "bar" | "board" = "bar",
): Promise<void> {
  const font = await ensureFont();
  const image = await loadImage(imagePath);
  const width = image.width;
  const height = image.height;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, width, height);
  drawHighlights(ctx, width, height, regions);

  const trimmed = line.trim();
  if (trimmed) {
    const fontSize = Math.max(28, Math.floor(width / 48));
    const marginX = width * 0.06;
    const padX = fontSize * 0.55;
    const padY = fontSize * 0.28;
    const lightBoard = style === "board";
    ctx.font = `${fontSize}px "${font}"`;
    const metrics = ctx.measureText(trimmed);
    const textWidth = metrics.width;
    const textHeight = fontSize;
    const boxWidth = Math.min(width - marginX * 2, textWidth + padX * 2);
    const boxHeight = textHeight + padY * 2;
    const boxX = (width - boxWidth) / 2;
    const boxY = height - height * 0.055 - boxHeight;
    const radius = Math.min(fontSize * 0.18, boxHeight / 2);
    ctx.fillStyle = lightBoard ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.86)";
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, radius);
    ctx.fill();
    ctx.fillStyle = lightBoard ? "#000000" : "#ffffff";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(trimmed, width / 2, boxY + boxHeight / 2);
  }

  await fs.writeFile(outputPath, await canvas.encode("png"));
}
