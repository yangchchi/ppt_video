import fs from "node:fs/promises";
import path from "node:path";
import { maxSlides } from "../config.js";
import { setJobProgress, type Job } from "../jobs.js";
import { speechProsody } from "../options.js";
import { ensureAvatar } from "./avatar.js";
import { extractDeck } from "./extractNotes.js";
import { renderSlides } from "./renderSlides.js";
import { synthesizeNotes } from "./synthesize.js";
import { composeVideo } from "./compose.js";

function phasePercent(base: number, span: number, current: number, total: number): number {
  if (total <= 0) return base;
  return base + (span * current) / total;
}

export async function runJob(job: Job): Promise<void> {
  job.status = "running";
  job.step = "validate";
  if (!job.startedAt) job.startedAt = new Date().toISOString();
  setJobProgress(job, 3, "正在核对页数和脚本。");

  const pptx = await fs.readFile(path.join(job.dir, "input.pptx"));
  const deck = extractDeck(pptx);
  if (deck.length > maxSlides) throw new Error(`幻灯片超过 ${maxSlides} 页。`);
  if (deck.length !== job.slides.length) {
    throw new Error(`幻灯片有 ${deck.length} 页，配置稿有 ${job.slides.length} 页。`);
  }
  job.slideCount = deck.length;
  job.slides = job.slides.map((slide) => ({
    ...slide,
    empty: slide.script.trim().length === 0,
  }));
  setJobProgress(job, 8, `共 ${deck.length} 页，准备导出画面。`, 0, deck.length);

  job.step = "render";
  setJobProgress(job, 10, "正在把演示文稿导出为高清画面，页数较多时会稍慢一些。", 0, deck.length);
  const images = await renderSlides(path.join(job.dir, "input.pptx"), job.dir);
  if (images.length !== deck.length) {
    throw new Error(`导出的画面有 ${images.length} 页，幻灯片有 ${deck.length} 页。`);
  }
  setJobProgress(job, 28, `画面已导出，共 ${images.length} 页。`, images.length, deck.length);

  job.step = "speech";
  const narrations = await synthesizeNotes(
    job.slides.map((slide) => slide.script),
    images,
    job.dir,
    job.voice,
    speechProsody(job.tone, job.pace),
    (current, total) => {
      const percent = phasePercent(28, 40, current, total);
      setJobProgress(job, percent, `正在合成旁白：第 ${current} / ${total} 页。`, current, total);
    },
  );

  job.step = "compose";
  setJobProgress(job, 70, "旁白已就绪，开始拼接视频。", 0, deck.length);
  const avatarPath = job.avatar === "none" ? null : await ensureAvatar(job.avatar);
  await composeVideo(
    images,
    narrations,
    job.effect,
    job.layout,
    job.music,
    job.highlight,
    job.captionStyle,
    deck.map((slide) => slide.regions),
    job.template,
    job.avatar,
    avatarPath,
    job.avatarCorner,
    job.avatarScale,
    job.dir,
    (current, total) => {
      const percent = phasePercent(70, 28, current, total);
      setJobProgress(job, percent, `正在拼接成片：第 ${current} / ${total} 页。`, current, total);
    },
  );
  job.step = null;
  job.status = "done";
  setJobProgress(job, 100, "视频已生成，可以预览和下载。", deck.length, deck.length);
}
