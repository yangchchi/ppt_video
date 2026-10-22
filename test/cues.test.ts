import assert from "node:assert/strict";
import test from "node:test";
import { alignLines, framePlan } from "../src/pipeline/cues.ts";

const second = 10_000_000;

test("按词边界把每一行接到它自己的语音结束时间", () => {
  const cues = alignLines(
    ["企业 AI 建设。", "若缺少统一规划。"],
    [
      { text: "企业", offset: 0, duration: 0.4 * second },
      { text: "AI", offset: 0.4 * second, duration: 0.3 * second },
      { text: "建设。", offset: 0.7 * second, duration: 0.5 * second },
      { text: "若缺少", offset: 1.2 * second, duration: 0.6 * second },
      { text: "统一规划。", offset: 1.8 * second, duration: 0.7 * second },
    ],
    2.8,
  );
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, "企业 AI 建设。");
  assert.equal(cues[0].start, 0);
  assert.ok(Math.abs(cues[0].end - 1.2) < 0.05);
  assert.equal(cues[1].start, cues[0].end);
  assert.equal(cues[1].end, 2.8);
});

test("字幕标点不在词边界里时，不把下一句的语音时间吃进上一句", () => {
  const cues = alignLines(
    ['以"服务主业"驱动。', "再看两个中心。"],
    [
      { text: "以", offset: 0, duration: 0.2 * second },
      { text: "服务", offset: 0.2 * second, duration: 0.4 * second },
      { text: "主业", offset: 0.6 * second, duration: 0.4 * second },
      { text: "驱动", offset: 1.0 * second, duration: 0.4 * second },
      { text: "再看", offset: 1.5 * second, duration: 0.4 * second },
      { text: "两个", offset: 1.9 * second, duration: 0.4 * second },
      { text: "中心", offset: 2.3 * second, duration: 0.4 * second },
    ],
    3.0,
  );
  assert.equal(cues.length, 2);
  assert.ok(Math.abs(cues[0].end - 1.4) < 0.05, `first end=${cues[0].end}`);
  assert.equal(cues[1].start, cues[0].end);
  assert.ok(cues[1].start < 1.6, `second start=${cues[1].start}`);
  assert.equal(cues[1].end, 3.0);
});

test("没有词边界时按字数分配时长", () => {
  const cues = alignLines(["一二", "三四六"], [], 5);
  assert.equal(cues[0].start, 0);
  assert.ok(Math.abs(cues[0].end - 2) < 0.001);
  assert.equal(cues[1].end, 5);
});

test("各行帧数相加等于整段音频的帧数", () => {
  const frames = framePlan([1.2, 0.8, 1.04], 3);
  assert.equal(frames.reduce((sum, count) => sum + count, 0), 90);
  assert.ok(frames.every((count) => count >= 1));
});
