import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { jobsDir, maxSlides } from "./config.js";
import {
  defaultCaptionStyle,
  defaultEffect,
  defaultImportMode,
  defaultLayout,
  defaultMusic,
  defaultPace,
  defaultScriptSource,
  defaultTone,
  defaultVoice,
  parseCaptionStyle,
  parseContext,
  parseEffect,
  parseHighlight,
  parseImportMode,
  parseLayout,
  parseMusic,
  parsePace,
  parseScriptSource,
  parseScripts,
  parseTone,
  parseVoice,
  type EffectId,
  type ImportMode,
  type JobSettings,
  type LayoutId,
  type PaceId,
  type ScriptSource,
  type ToneId,
  type VoiceId,
} from "./options.js";
import { defaultAvatar, defaultTemplate, parseAvatar, parseTemplate } from "./catalog.js";
import { extractDeck, type SlideCopy, type SlideRegion } from "./pipeline/extractNotes.js";
import { buildNarration, type ScriptContext } from "./pipeline/script.js";
import { runJob } from "./pipeline/runJob.js";

export type JobStatus = "draft" | "queued" | "running" | "done" | "failed";
export type JobStep = "validate" | "render" | "speech" | "compose";

export class JobError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface SlideInfo {
  index: number;
  note: string;
  title: string;
  bullets: string[];
  regions: SlideRegion[];
  script: string;
  empty: boolean;
}

export interface Job extends JobSettings {
  id: string;
  filename: string;
  bytes: number;
  createdAt: string;
  status: JobStatus;
  step: JobStep | null;
  slideCount: number;
  slides: SlideInfo[];
  error: string | null;
  dir: string;
}

const jobs = new Map<string, Job>();
let queue: Promise<void> = Promise.resolve();

function summarize(note: string): string {
  const flat = note.replace(/\s+/g, " ").trim();
  return flat.length > 120 ? `${flat.slice(0, 120)}…` : flat;
}

function contextOf(job: Job): ScriptContext {
  return { audience: job.audience, speaker: job.speaker, goals: job.goals };
}

function storedRegions(value: unknown): SlideRegion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const region = item as Partial<SlideRegion>;
    const x = Number(region.x);
    const y = Number(region.y);
    const w = Number(region.w);
    const h = Number(region.h);
    if (typeof region.text !== "string" || ![x, y, w, h].every((part) => Number.isFinite(part))) return [];
    return [{ text: region.text, x, y, w, h }];
  });
}

function slideFromCopy(slide: SlideCopy, script: string): SlideInfo {
  return {
    index: slide.index,
    note: slide.note,
    title: slide.title,
    bullets: slide.bullets,
    regions: slide.regions ?? [],
    script,
    empty: script.trim().length === 0,
  };
}

export function toPublicJob(job: Job) {
  const editing = job.status === "draft";
  return {
    id: job.id,
    filename: job.filename,
    bytes: job.bytes,
    createdAt: job.createdAt,
    status: job.status,
    step: job.step,
    slideCount: job.slideCount,
    effect: job.effect,
    voice: job.voice,
    tone: job.tone,
    pace: job.pace,
    layout: job.layout,
    template: job.template,
    avatar: job.avatar,
    music: job.music,
    highlight: job.highlight,
    captionStyle: job.captionStyle,
    scriptSource: job.scriptSource,
    importMode: job.importMode,
    audience: job.audience,
    speaker: job.speaker,
    goals: job.goals,
    slides: job.slides.map((slide) => ({
      index: slide.index,
      note: editing ? slide.note : summarize(slide.note),
      title: slide.title,
      bullets: editing ? slide.bullets : [],
      script: editing ? slide.script : summarize(slide.script),
      empty: slide.empty,
    })),
    error: job.error,
  };
}

function jobRecord(job: Job) {
  const { dir: _dir, ...record } = job;
  return record;
}

async function saveJob(job: Job): Promise<void> {
  await fs.writeFile(path.join(job.dir, "job.json"), JSON.stringify(jobRecord(job)));
}

function defaults(): JobSettings {
  return {
    effect: defaultEffect,
    voice: defaultVoice,
    tone: defaultTone,
    pace: defaultPace,
    layout: defaultLayout,
    template: defaultTemplate,
    avatar: defaultAvatar,
    music: defaultMusic,
    highlight: true,
    captionStyle: defaultCaptionStyle,
    scriptSource: defaultScriptSource,
    importMode: defaultImportMode,
    audience: "",
    speaker: "",
    goals: "",
  };
}

function storedAvatar(value: unknown) {
  try {
    return parseAvatar(value);
  } catch {
    return defaultAvatar;
  }
}

function hydrate(raw: Partial<Job> & { id: string; dir: string }): Job {
  const base = defaults();
  const slides = Array.isArray(raw.slides) ? raw.slides.map((slide) => ({
    index: slide.index,
    note: slide.note ?? "",
    title: slide.title ?? "",
    bullets: Array.isArray(slide.bullets) ? slide.bullets : [],
    regions: storedRegions(slide.regions),
    script: slide.script ?? slide.note ?? "",
    empty: slide.empty ?? (slide.script ?? slide.note ?? "").trim().length === 0,
  })) : [];
  return {
    ...base,
    ...raw,
    filename: raw.filename ?? "未命名.pptx",
    bytes: raw.bytes ?? 0,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    status: raw.status ?? "failed",
    step: raw.step ?? null,
    slideCount: raw.slideCount ?? slides.length,
    slides,
    error: raw.error ?? null,
    effect: raw.effect ?? base.effect,
    voice: raw.voice ?? base.voice,
    tone: raw.tone ?? base.tone,
    pace: raw.pace ?? base.pace,
    layout: raw.layout ?? base.layout,
    template: (() => {
      try {
        return parseTemplate(raw.template ?? base.template);
      } catch {
        return base.template;
      }
    })(),
    avatar: storedAvatar(raw.avatar ?? base.avatar),
    music: (() => {
      try {
        return parseMusic(raw.music ?? base.music);
      } catch {
        return base.music;
      }
    })(),
    highlight: raw.highlight ?? true,
    captionStyle: (() => {
      const value = raw.captionStyle as string | undefined;
      if (value === "classic" || value === "minimal") return "bar";
      try {
        return parseCaptionStyle(value ?? base.captionStyle);
      } catch {
        return base.captionStyle;
      }
    })(),
    scriptSource: raw.scriptSource ?? base.scriptSource,
    importMode: raw.importMode ?? base.importMode,
    audience: raw.audience ?? "",
    speaker: raw.speaker ?? "",
    goals: raw.goals ?? "",
    dir: raw.dir,
  };
}

export async function loadJobs(): Promise<void> {
  let names: string[] = [];
  try {
    names = await fs.readdir(jobsDir);
  } catch {
    return;
  }
  for (const name of names) {
    if (!/^[0-9a-f-]{36}$/i.test(name)) continue;
    const dir = path.join(jobsDir, name);
    try {
      const metaPath = path.join(dir, "job.json");
      const videoReady = await fs.stat(path.join(dir, "output.mp4")).then((stat) => stat, () => null);
      try {
        await fs.access(metaPath);
      } catch {
        if (!videoReady) continue;
        const slides = await fs.readdir(path.join(dir, "slides")).catch(() => []);
        const recovered = hydrate({
          id: name,
          dir,
          filename: "未命名.pptx",
          createdAt: videoReady.mtime.toISOString(),
          status: "done",
          slideCount: slides.filter((item) => /^slide-\d+\.png$/.test(item)).length,
          slides: [],
        });
        await saveJob(recovered);
      }
      const raw = JSON.parse(await fs.readFile(metaPath, "utf8")) as Omit<Job, "dir">;
      const job = hydrate({ ...raw, dir });
      const hasVideo = videoReady !== null;
      if (hasVideo) job.status = "done";
      else if (job.status === "queued" || job.status === "running") {
        job.status = "failed";
        job.step = null;
        job.error = "服务重启，这次转换已中断。";
        await saveJob(job);
      }
      jobs.set(job.id, job);
    } catch {
      continue;
    }
  }
}

export async function listHistory() {
  const ready: Job[] = [];
  for (const job of jobs.values()) {
    if (job.status !== "done") continue;
    const videoReady = await fs.stat(path.join(job.dir, "output.mp4")).then(() => true, () => false);
    if (videoReady) ready.push(job);
  }
  ready.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return ready.map((job) => ({
    id: job.id,
    filename: job.filename,
    createdAt: job.createdAt,
    slideCount: job.slideCount,
    effect: job.effect,
    voice: job.voice,
    layout: job.layout,
    template: job.template,
    avatar: job.avatar,
    music: job.music,
    highlight: job.highlight,
  }));
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function hasActiveJob(): boolean {
  for (const job of jobs.values()) {
    if (job.status === "queued" || job.status === "running") return true;
  }
  return false;
}

function scriptsFor(deck: SlideCopy[], source: ScriptSource, context: ScriptContext): string[] {
  return deck.map((slide, index) => buildNarration(slide, source, context, index, deck.length));
}

export async function createDraft(pptx: Buffer, filename: string): Promise<Job> {
  const id = randomUUID();
  const dir = path.join(jobsDir, id);
  await fs.mkdir(dir, { recursive: true });
  try {
    const deck = extractDeck(pptx);
    if (deck.length > maxSlides) throw new JobError(`幻灯片超过 ${maxSlides} 页。`);
    await fs.writeFile(path.join(dir, "input.pptx"), pptx);
    const settings = defaults();
    const scripts = scriptsFor(deck, settings.scriptSource, settings);
    const job: Job = {
      id,
      filename,
      bytes: pptx.length,
      createdAt: new Date().toISOString(),
      status: "draft",
      step: null,
      slideCount: deck.length,
      slides: deck.map((slide, index) => slideFromCopy(slide, scripts[index])),
      error: null,
      dir,
      ...settings,
    };
    jobs.set(job.id, job);
    await saveJob(job);
    return job;
  } catch (error) {
    jobs.delete(id);
    await fs.rm(dir, { recursive: true, force: true });
    if (error instanceof JobError) throw error;
    throw new JobError(error instanceof Error ? error.message : "无法读取演示文稿。");
  }
}

export function previewScripts(job: Job, input: unknown): string[] {
  if (job.status !== "draft") throw new JobError("只有还没开始的配置稿可以重写脚本。", 409);
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const source = parseScriptSource(body.scriptSource);
  const context = {
    audience: parseContext(body.audience),
    speaker: parseContext(body.speaker),
    goals: parseContext(body.goals),
  };
  return job.slides.map((slide, index) => buildNarration({
    index: slide.index,
    note: slide.note,
    title: slide.title,
    bullets: slide.bullets,
    regions: slide.regions ?? [],
  }, source, context, index, job.slides.length));
}

function readSettings(input: unknown): JobSettings & { scripts?: string[] } {
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return {
    effect: parseEffect(body.effect),
    voice: parseVoice(body.voice),
    tone: parseTone(body.tone),
    pace: parsePace(body.pace),
    layout: parseLayout(body.layout),
    template: parseTemplate(body.template),
    avatar: parseAvatar(body.avatar),
    music: parseMusic(body.music),
    highlight: parseHighlight(body.highlight),
    captionStyle: parseCaptionStyle(body.captionStyle),
    scriptSource: parseScriptSource(body.scriptSource),
    importMode: parseImportMode(body.importMode),
    audience: parseContext(body.audience),
    speaker: parseContext(body.speaker),
    goals: parseContext(body.goals),
    scripts: body.scripts as string[] | undefined,
  };
}

export async function startJob(id: string, input: unknown): Promise<Job> {
  const job = jobs.get(id);
  if (!job || job.status !== "draft") throw new JobError("这个配置稿不能开始生成。", 404);
  if (hasActiveJob()) throw new JobError("已有任务在处理，请等它完成。", 409);
  const settings = readSettings(input);
  const deck = job.slides.map((slide) => ({
    index: slide.index,
    note: slide.note,
    title: slide.title,
    bullets: slide.bullets,
    regions: slide.regions ?? [],
  }));
  const scripts = settings.importMode === "editable"
    ? parseScripts(settings.scripts, job.slides.length)
    : scriptsFor(deck, settings.scriptSource, settings);
  Object.assign(job, {
    effect: settings.effect,
    voice: settings.voice,
    tone: settings.tone,
    pace: settings.pace,
    layout: settings.layout,
    template: settings.template,
    avatar: settings.avatar,
    music: settings.music,
    highlight: settings.highlight,
    captionStyle: settings.captionStyle,
    scriptSource: settings.scriptSource,
    importMode: settings.importMode,
    audience: settings.audience,
    speaker: settings.speaker,
    goals: settings.goals,
  });
  job.slides = job.slides.map((slide, index) => slideFromCopy(deck[index], scripts[index]));
  job.status = "queued";
  job.step = null;
  job.error = null;
  await saveJob(job);
  enqueue(job);
  return job;
}

export async function deleteDraft(id: string): Promise<void> {
  const job = jobs.get(id);
  if (!job) throw new JobError("任务不存在。", 404);
  if (job.status !== "draft") throw new JobError("已经开始的任务不能删除。", 409);
  jobs.delete(id);
  await fs.rm(job.dir, { recursive: true, force: true });
}

function enqueue(job: Job): void {
  const work = async () => {
    try {
      await runJob(job);
      await saveJob(job);
    } catch (error) {
      job.status = "failed";
      job.step = null;
      job.error = error instanceof Error ? error.message : "转换失败。";
      await fs.rm(path.join(job.dir, "output.mp4"), { force: true });
      await saveJob(job);
    }
  };
  queue = queue.then(work, work);
}

export type { EffectId, VoiceId, ToneId, PaceId, LayoutId, ScriptSource, ImportMode };
