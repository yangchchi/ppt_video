import fs from "node:fs/promises";
import path from "node:path";
import { maxSlides } from "../config.js";
import type { Job } from "../jobs.js";
import { speechProsody } from "../options.js";
import { ensureAvatar } from "./avatar.js";
import { extractDeck } from "./extractNotes.js";
import { renderSlides } from "./renderSlides.js";
import { synthesizeNotes } from "./synthesize.js";
import { composeVideo } from "./compose.js";

export async function runJob(job: Job): Promise<void> {
  job.status = "running";
  job.step = "validate";
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

  job.step = "render";
  const images = await renderSlides(path.join(job.dir, "input.pptx"), job.dir);
  if (images.length !== deck.length) {
    throw new Error(`导出的画面有 ${images.length} 页，幻灯片有 ${deck.length} 页。`);
  }

  job.step = "speech";
  const narrations = await synthesizeNotes(
    job.slides.map((slide) => slide.script),
    images,
    job.dir,
    job.voice,
    speechProsody(job.tone, job.pace),
  );

  job.step = "compose";
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
    job.dir,
  );
  job.step = null;
  job.status = "done";
}
