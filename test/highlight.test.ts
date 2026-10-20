import assert from "node:assert/strict";
import test from "node:test";
import { regionsForLine, type HighlightRegion } from "../src/pipeline/highlight.ts";
import { slideRegionsFromXml } from "../src/pipeline/extractNotes.ts";

const slideWidth = 12192000;
const slideHeight = 6858000;

const regions: HighlightRegion[] = [
  { text: "建设背景", x: 0.1, y: 0.2, w: 0.8, h: 0.2 },
  { text: "先看范围，再决定步骤。", x: 0.1, y: 0.5, w: 0.7, h: 0.15 },
];

test("字幕完整包含形状文字时框出该形状", () => {
  assert.deepEqual(regionsForLine("今天讲建设背景。", regions), [regions[0]]);
});

test("字幕只是形状里足够长的一段时框出该形状", () => {
  assert.deepEqual(regionsForLine("先看范围", regions), [regions[1]]);
});

test("对不上或过短时不框", () => {
  assert.deepEqual(regionsForLine("这是备注里的另一件事。", regions), []);
  assert.deepEqual(regionsForLine("再", regions), []);
});

test("一行对上多个形状时全部框出，同一个矩形只留一次", () => {
  const duplicated = [...regions, { ...regions[0] }];
  assert.deepEqual(regionsForLine("建设背景。先看范围，再决定步骤。", duplicated), regions);
});

test("从形状位置读出相对矩形，跳过页码、无位置和组合形状", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree>
<p:sp><p:spPr><a:xfrm><a:off x="1219200" y="1371600"/><a:ext cx="9753600" cy="1371600"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>建设背景</a:t></a:r></a:p></p:txBody></p:sp>
<p:sp><p:nvSpPr><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>3</a:t></a:r></a:p></p:txBody></p:sp>
<p:sp><p:txBody><a:p><a:r><a:t>没有位置</a:t></a:r></a:p></p:txBody></p:sp>
<p:grpSp><p:sp><p:spPr><a:xfrm><a:off x="100" y="100"/><a:ext cx="100" cy="100"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>组合里的字</a:t></a:r></a:p></p:txBody></p:sp></p:grpSp>
</p:spTree></p:cSld></p:sld>`;
  assert.deepEqual(slideRegionsFromXml(xml, slideWidth, slideHeight), [
    { text: "建设背景", x: 0.1, y: 0.2, w: 0.8, h: 0.2 },
  ]);
});
