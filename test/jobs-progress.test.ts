import assert from "node:assert/strict";
import test from "node:test";
import { setJobProgress, toPublicJob, type Job } from "../src/jobs.ts";

function stubJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    filename: "demo.pptx",
    bytes: 10,
    createdAt: "2026-01-01T00:00:00.000Z",
    startedAt: null,
    status: "running",
    step: "speech",
    progress: null,
    slideCount: 3,
    slides: [],
    error: null,
    dir: "/tmp/job-1",
    effect: "none",
    voice: "zh-CN-XiaoxiaoNeural",
    tone: "neutral",
    pace: "auto",
    layout: "fit",
    template: "none",
    avatar: "none",
    avatarCorner: "right",
    avatarScale: 0.4,
    music: "none",
    highlight: false,
    captionStyle: "bar",
    scriptSource: "notes",
    importMode: "static",
    audience: "",
    speaker: "",
    goals: "",
    ...overrides,
  };
}

test("setJobProgress 写入百分比与页进度文案字段", () => {
  const job = stubJob();
  setJobProgress(job, 42.6, "正在合成旁白：第 2 / 3 页。", 2, 3);
  assert.deepEqual(job.progress, {
    percent: 43,
    detail: "正在合成旁白：第 2 / 3 页。",
    current: 2,
    total: 3,
  });
});

test("toPublicJob 暴露 startedAt 与 progress", () => {
  const job = stubJob({
    startedAt: "2026-01-01T00:01:00.000Z",
    progress: { percent: 50, detail: "处理中", current: 1, total: 2 },
  });
  const pub = toPublicJob(job);
  assert.equal(pub.startedAt, "2026-01-01T00:01:00.000Z");
  assert.deepEqual(pub.progress, {
    percent: 50,
    detail: "处理中",
    current: 1,
    total: 2,
  });
});
