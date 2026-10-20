import test from "node:test";
import assert from "node:assert/strict";
import { GlobalFonts } from "@napi-rs/canvas";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wrapTextLines } from "../src/pipeline/subtitles.js";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const fontFile = path.join(root, "assets", "fonts", "NotoSansSC-Regular.otf");

test("wrapTextLines splits long Chinese text", () => {
  GlobalFonts.registerFromPath(fontFile, "MotionDeckSans");
  const text = "这是一段用来测试字幕自动换行的中文内容，需要足够长才能折成多行。";
  const lines = wrapTextLines(text, 640, "MotionDeckSans");
  assert.ok(lines.length >= 2);
  assert.equal(lines.join(""), text.replaceAll("\n", ""));
});

test("wrapTextLines keeps paragraph breaks", () => {
  GlobalFonts.registerFromPath(fontFile, "MotionDeckSans");
  const lines = wrapTextLines("第一行\n第二行", 1920, "MotionDeckSans");
  assert.deepEqual(lines, ["第一行", "第二行"]);
});
