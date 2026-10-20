import fs from "node:fs/promises";
import path from "node:path";
import { slideWidth } from "../config.js";
import { runCommand } from "./command.js";
import { prepareOfficeFonts } from "./officeFonts.js";
import { resolveSoffice } from "./tools.js";

async function convertToPdf(pptxPath: string, workDir: string): Promise<string> {
  const soffice = await resolveSoffice();
  const { profileDir, env } = await prepareOfficeFonts(workDir);
  const userInstallation = `file://${profileDir}`;
  await runCommand(
    soffice,
    [
      "--headless",
      "--norestore",
      "--nolockcheck",
      `-env:UserInstallation=${userInstallation}`,
      "--convert-to",
      "pdf",
      "--outdir",
      workDir,
      pptxPath,
    ],
    { timeoutMs: 300_000, env },
  );
  const base = path.basename(pptxPath, path.extname(pptxPath));
  const pdfPath = path.join(workDir, `${base}.pdf`);
  try {
    await fs.access(pdfPath);
  } catch {
    throw new Error("LibreOffice 未生成 PDF。请确认已安装 LibreOffice Impress，并检查上传的演示文稿。");
  }
  const slidesPdf = path.join(workDir, "slides.pdf");
  if (pdfPath !== slidesPdf) {
    await fs.rename(pdfPath, slidesPdf);
  }
  return slidesPdf;
}

async function pdfToPng(pdfPath: string, slideDir: string): Promise<string[]> {
  const prefix = path.join(slideDir, "page");
  await runCommand(
    "pdftoppm",
    ["-png", "-scale-to-x", String(slideWidth), "-scale-to-y", "-1", pdfPath, prefix],
    180_000,
  );
  const names = (await fs.readdir(slideDir))
    .filter((name) => /^page-\d+\.png$/.test(name))
    .sort((left, right) => {
      const a = Number(left.match(/\d+/)?.[0] ?? 0);
      const b = Number(right.match(/\d+/)?.[0] ?? 0);
      return a - b;
    });
  if (names.length === 0) throw new Error("没有导出任何幻灯片画面。");
  const outputs: string[] = [];
  for (const [index, name] of names.entries()) {
    const target = path.join(slideDir, `slide-${String(index + 1).padStart(3, "0")}.png`);
    await fs.rename(path.join(slideDir, name), target);
    outputs.push(target);
  }
  return outputs;
}

export async function renderSlides(pptxPath: string, workDir: string): Promise<string[]> {
  const slideDir = path.join(workDir, "slides");
  await fs.mkdir(slideDir, { recursive: true });
  try {
    const pdfPath = await convertToPdf(pptxPath, workDir);
    return await pdfToPng(pdfPath, slideDir);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (detail.includes("找不到命令 pdftoppm") || detail.includes("pdftoppm")) {
      throw new Error("找不到 pdftoppm。请安装 poppler-utils（macOS: brew install poppler），或使用 Docker 镜像。");
    }
    if (detail.includes("LibreOffice") || detail.includes("soffice") || detail.includes("中文字体")) {
      throw new Error(detail);
    }
    throw new Error(`导出幻灯片失败：${detail}`);
  }
}
