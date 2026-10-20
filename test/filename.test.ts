import assert from "node:assert/strict";
import test from "node:test";
import { uploadFilename } from "../src/server.ts";

test("把请求头里的 UTF-8 文件名从 Latin-1 还原", () => {
  const original = "估价方案.pptx";
  const header = Buffer.from(original, "utf8").toString("latin1");
  assert.notEqual(header, original);
  assert.equal(uploadFilename(header), original);
});

test("已经是中文的文件名保持不变", () => {
  assert.equal(uploadFilename("估价方案.pptx"), "估价方案.pptx");
});
