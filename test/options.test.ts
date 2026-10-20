import assert from "node:assert/strict";
import test from "node:test";
import { parseAvatarCorner, parseAvatarScale } from "../src/catalog.ts";
import { defaultEffect, defaultVoice, parseEffect, parseVoice, speechProsody } from "../src/options.ts";

test("转场和音色缺省时使用默认值", () => {
  assert.equal(parseEffect(undefined), defaultEffect);
  assert.equal(parseVoice(""), defaultVoice);
});

test("拒绝未知转场和音色", () => {
  assert.throws(() => parseEffect("spin"), /不支持的转场/);
  assert.throws(() => parseVoice("en-US-AriaNeural"), /不支持的音色/);
});

test("接受页面提供的转场和音色", () => {
  assert.equal(parseEffect("wipe"), "wipe");
  assert.equal(parseVoice("zh-CN-YunxiNeural"), "zh-CN-YunxiNeural");
  assert.equal(parseVoice("zh-HK-HiuMaanNeural"), "zh-HK-HiuMaanNeural");
});

test("语调加快和放慢叠在一起，并限制幅度", () => {
  assert.deepEqual(speechProsody("vivid", "short"), { rate: "+22%", pitch: "+2Hz", emptySeconds: 2 });
  assert.equal(speechProsody("formal", "long").rate, "-18%");
  assert.equal(speechProsody("neutral", "auto").emptySeconds, 3);
});

test("数字人布局与比例可解析", () => {
  assert.equal(parseAvatarCorner(""), "right");
  assert.equal(parseAvatarScale("", "none"), 0.4);
  assert.equal(parseAvatarScale("0.85", "left"), 0.85);
});
