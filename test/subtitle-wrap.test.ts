import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { wrapSubtitleLines } from "../src/pipeline/subtitles.ts";

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "slide-blank.png");

async function wrap(text: string): Promise<string[]> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "subtitle-wrap-"));
  try {
    return await wrapSubtitleLines(fixture, text, workDir);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

test("长句优先在逗号处断开，不在汉字词中间拦腰截断", async () => {
  const text =
    '以"服务688主业 + 市场拓展"双轮驱动，六大中心分工承接，形成"业务对接—产品定义—技术实现—数据支撑—办公保障"的完整闭环。';
  const lines = await wrap(text);
  assert.ok(lines.length >= 2, `expected multiple lines, got ${JSON.stringify(lines)}`);
  for (let index = 0; index < lines.length - 1; index += 1) {
    assert.ok(
      !(lines[index].endsWith("技") && lines[index + 1].startsWith("术")),
      `broke mid-word across lines: ${JSON.stringify(lines)}`,
    );
  }
  assert.ok(
    lines.slice(0, -1).some((line) => /[，。！？；]["”」』]?\s*$/.test(line)),
    `expected a natural break at punctuation: ${JSON.stringify(lines)}`,
  );
  assert.ok(!lines.some((line) => line.trim() === "。"), `orphan period line: ${JSON.stringify(lines)}`);
});

test("能放下的整句各自成为一条字幕", async () => {
  const lines = await wrap("先看业务两条线。再看六个中心。");
  assert.deepEqual(lines, ["先看业务两条线。", "再看六个中心。"]);
});
