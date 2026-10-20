import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { avatars, defaultAvatar, defaultTemplate, parseAvatar, templates } from "./catalog.js";
import { dataDir, maxUploadMb, publicDir } from "./config.js";
import {
  createDraft,
  deleteDraft,
  getJob,
  hasActiveJob,
  JobError,
  listHistory,
  previewScripts,
  startJob,
  toPublicJob,
} from "./jobs.js";
import {
  captionStyles,
  defaultCaptionStyle,
  defaultEffect,
  defaultImportMode,
  defaultLayout,
  defaultMusic,
  defaultPace,
  defaultScriptSource,
  defaultTone,
  defaultVoice,
  effects,
  importModes,
  languages,
  layouts,
  musicTracks,
  paces,
  parsePace,
  parseTone,
  parseVoice,
  previewLine,
  scriptSources,
  speechProsody,
  tones,
  voices,
} from "./options.js";
import { ensureAvatar } from "./pipeline/avatar.js";
import { synthesizePreview } from "./pipeline/synthesize.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadMb * 1024 * 1024 },
});

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jobFile(id: string, name: string): string | null {
  if (!idPattern.test(id)) return null;
  const job = getJob(id);
  if (!job) return null;
  return path.join(job.dir, name);
}

export function uploadFilename(original: string): string {
  const decoded = [...original].some((char) => char.charCodeAt(0) > 255)
    ? original
    : Buffer.from(original, "latin1").toString("utf8");
  const name = decoded.includes("\uFFFD") ? original : decoded;
  return path.basename(name).replace(/[\\/]/g, "") || "未命名.pptx";
}

function sendJobError(res: express.Response, error: unknown) {
  if (error instanceof JobError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : "请求失败。";
  res.status(400).json({ error: message });
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(publicDir));

  app.get("/api/options", (_req, res) => {
    res.json({
      effects,
      voices,
      languages,
      tones,
      paces,
      layouts,
      templates,
      avatars,
      scriptSources,
      importModes,
      captionStyles,
      musicTracks,
      defaults: {
        effect: defaultEffect,
        voice: defaultVoice,
        tone: defaultTone,
        pace: defaultPace,
        layout: defaultLayout,
        template: defaultTemplate,
        avatar: defaultAvatar,
        scriptSource: defaultScriptSource,
        importMode: defaultImportMode,
        captionStyle: defaultCaptionStyle,
        music: defaultMusic,
        highlight: true,
      },
    });
  });

  app.get("/create", (_req, res) => {
    res.sendFile(path.join(publicDir, "create.html"));
  });

  app.get("/history", (_req, res) => {
    res.sendFile(path.join(publicDir, "history.html"));
  });

  app.get("/api/avatars/:id", async (req, res) => {
    try {
      const id = parseAvatar(req.params.id);
      if (id === "none") {
        res.status(404).json({ error: "没有这张肖像。" });
        return;
      }
      const filePath = await ensureAvatar(id);
      res.type("png").sendFile(filePath);
    } catch (error) {
      sendJobError(res, error);
    }
  });

  app.get("/api/jobs/active", (_req, res) => {
    res.json({ busy: hasActiveJob() });
  });

  app.get("/api/jobs", async (_req, res) => {
    res.json({ jobs: await listHistory() });
  });

  app.post("/api/jobs", (req, res) => {
    upload.single("file")(req, res, async (error) => {
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: `文件超过 ${maxUploadMb} MB。` });
        return;
      }
      if (error) {
        res.status(400).json({ error: "上传失败。" });
        return;
      }
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "请上传 PPT 文件。" });
        return;
      }
      const filename = uploadFilename(file.originalname);
      if (!filename.toLowerCase().endsWith(".pptx")) {
        res.status(400).json({ error: "只支持 .pptx 文件。" });
        return;
      }
      try {
        const job = await createDraft(file.buffer, filename);
        res.status(201).json(toPublicJob(job));
      } catch (error) {
        sendJobError(res, error);
      }
    });
  });

  app.delete("/api/jobs/:id", async (req, res) => {
    try {
      await deleteDraft(req.params.id);
      res.status(204).end();
    } catch (error) {
      sendJobError(res, error);
    }
  });

  app.post("/api/jobs/:id/scripts", (req, res) => {
    const job = getJob(req.params.id);
    if (!job || !idPattern.test(req.params.id)) {
      res.status(404).json({ error: "任务不存在。" });
      return;
    }
    try {
      res.json({ scripts: previewScripts(job, req.body) });
    } catch (error) {
      sendJobError(res, error);
    }
  });

  app.post("/api/jobs/:id/start", async (req, res) => {
    if (!idPattern.test(req.params.id)) {
      res.status(404).json({ error: "任务不存在。" });
      return;
    }
    try {
      const job = await startJob(req.params.id, req.body);
      res.json(toPublicJob(job));
    } catch (error) {
      sendJobError(res, error);
    }
  });

  app.post("/api/voices/preview", async (req, res) => {
    try {
      const voice = parseVoice(req.body?.voice);
      const tone = parseTone(req.body?.tone);
      const pace = parsePace(req.body?.pace);
      const previewDir = path.join(dataDir, "previews");
      await fs.promises.mkdir(previewDir, { recursive: true });
      const filePath = path.join(previewDir, `${voice}-${tone}-${pace}.mp3`);
      if (!fs.existsSync(filePath)) {
        await synthesizePreview(previewLine(voice), voice, speechProsody(tone, pace), filePath);
      }
      res.type("audio/mpeg").sendFile(filePath);
    } catch (error) {
      sendJobError(res, error);
    }
  });

  app.get("/api/jobs/:id", (req, res) => {
    const job = getJob(req.params.id);
    if (!job || !idPattern.test(req.params.id)) {
      res.status(404).json({ error: "任务不存在。" });
      return;
    }
    res.json(toPublicJob(job));
  });

  app.get("/api/jobs/:id/video", (req, res) => {
    const filePath = jobFile(req.params.id, "output.mp4");
    if (!filePath || !fs.existsSync(filePath)) {
      res.status(404).json({ error: "视频还不存在。" });
      return;
    }
    res.sendFile(filePath);
  });

  app.get("/api/jobs/:id/slides/:index", (req, res) => {
    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 1) {
      res.status(404).json({ error: "页面不存在。" });
      return;
    }
    const name = `slides/slide-${String(index).padStart(3, "0")}.png`;
    const filePath = jobFile(req.params.id, name);
    if (!filePath || !fs.existsSync(filePath)) {
      res.status(404).json({ error: "页面不存在。" });
      return;
    }
    res.sendFile(filePath);
  });

  return app;
}
