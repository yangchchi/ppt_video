import fs from "node:fs/promises";
import path from "node:path";
import { pdfToPngBin, pdfToPngSource, slideWidth } from "../config.js";
import { escapeAppleScriptString, runCommand } from "./command.js";

async function ensurePdfRenderer(): Promise<void> {
  await fs.mkdir(path.dirname(pdfToPngBin), { recursive: true });
  const [sourceStat, binStat] = await Promise.all([
    fs.stat(pdfToPngSource),
    fs.stat(pdfToPngBin).catch(() => null),
  ]);
  if (!binStat || binStat.mtimeMs < sourceStat.mtimeMs) {
    await runCommand("swiftc", ["-O", pdfToPngSource, "-o", pdfToPngBin], 120_000);
  }
}

function exportScript(pptxPath: string, pdfPath: string): string {
  const pptx = escapeAppleScriptString(pptxPath);
  const pdf = escapeAppleScriptString(pdfPath);
  return `
set pptxAlias to POSIX file "${pptx}" as alias
do shell script "touch " & quoted form of "${pdf}"
set outFile to POSIX file "${pdf}"
tell application "Microsoft PowerPoint"
  launch
  open pptxAlias
  delay 1
  save active presentation in outFile as save as PDF
  close active presentation saving no
end tell
`.trim();
}

export async function renderSlides(pptxPath: string, workDir: string): Promise<string[]> {
  const pdfPath = path.join(workDir, "slides.pdf");
  const slideDir = path.join(workDir, "slides");
  const scriptPath = path.join(workDir, "export.applescript");
  await fs.mkdir(slideDir, { recursive: true });
  await fs.writeFile(scriptPath, exportScript(pptxPath, pdfPath));
  try {
    await runCommand("osascript", [scriptPath], 180_000);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (detail.includes("-9074")) {
      throw new Error("PowerPoint 无法打开这个文件。请先处理 PowerPoint 里的对话框或未保存提示，然后重试。");
    }
    throw new Error(`PowerPoint 导出 PDF 失败：${detail}`);
  }
  await ensurePdfRenderer();
  await runCommand(pdfToPngBin, [pdfPath, slideDir, String(slideWidth)], 120_000);
  const names = (await fs.readdir(slideDir))
    .filter((name) => /^slide-\d+\.png$/.test(name))
    .sort();
  if (names.length === 0) throw new Error("没有导出任何幻灯片画面。");
  return names.map((name) => path.join(slideDir, name));
}
