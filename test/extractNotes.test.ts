import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { extractDeck, extractNotes, notesTextFromXml, slideCopyFromXml } from "../src/pipeline/extractNotes.ts";

function slideXml(title: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;
}

function notesXml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree>
<p:sp>
<p:nvSpPr><p:cNvPr id="2" name="Slide Image"/><p:cNvSpPr/><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr>
<p:txBody><a:p><a:r><a:t>不应朗读的缩略图文字</a:t></a:r></a:p></p:txBody>
</p:sp>
<p:sp>
<p:nvSpPr><p:cNvPr id="3" name="Notes"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
<p:txBody><a:p><a:r><a:t>${body}</a:t></a:r></a:p><a:p><a:r><a:t>第二段</a:t></a:r></a:p></p:txBody>
</p:sp>
<p:sp>
<p:nvSpPr><p:cNvPr id="4" name="Number"/><p:cNvSpPr/><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr>
<p:txBody><a:p><a:fld type="slidenum"><a:t>1</a:t></a:fld></a:p></p:txBody>
</p:sp>
</p:spTree></p:cSld>
</p:notes>`;
}

function presentation(slideCount: number): string {
  const ids = Array.from({ length: slideCount }, (_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:sldIdLst>${ids}</p:sldIdLst>
</p:presentation>`;
}

function rels(items: Array<[string, string, string]>): string {
  const body = items
    .map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`;
}

test("按页序读取正文备注，忽略页码和缩略图", () => {
  const notesType = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide";
  const slideType = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide";
  const files: Record<string, Uint8Array> = {
    "ppt/presentation.xml": strToU8(presentation(2)),
    "ppt/_rels/presentation.xml.rels": strToU8(rels([
      ["rId1", slideType, "slides/slide1.xml"],
      ["rId2", slideType, "slides/slide2.xml"],
    ])),
    "ppt/slides/slide1.xml": strToU8(slideXml("第一页")),
    "ppt/slides/_rels/slide1.xml.rels": strToU8(rels([
      ["rId2", notesType, "../notesSlides/notesSlide1.xml"],
    ])),
    "ppt/notesSlides/notesSlide1.xml": strToU8(notesXml("企业 AI 建设进入工程化阶段。")),
    "ppt/slides/slide2.xml": strToU8(slideXml("第二页")),
    "ppt/slides/_rels/slide2.xml.rels": strToU8(rels([])),
  };
  const notes = extractNotes(zipSync(files));
  assert.deepEqual(notes, [
    { index: 1, text: "企业 AI 建设进入工程化阶段。\n第二段" },
    { index: 2, text: "" },
  ]);
});

test("页面文字取标题和要点，跳过页码", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree>
<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>开场</a:t></a:r></a:p></p:txBody></p:sp>
<p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>先看范围</a:t></a:r></a:p><a:p><a:r><a:t>再看步骤</a:t></a:r></a:p></p:txBody></p:sp>
<p:sp><p:nvSpPr><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>3</a:t></a:r></a:p></p:txBody></p:sp>
</p:spTree></p:cSld></p:sld>`;
  assert.deepEqual(slideCopyFromXml(xml), { title: "开场", bullets: ["先看范围", "再看步骤"] });
});

test("整份文稿同时带出备注和页面文字", () => {
  const notesType = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide";
  const slideType = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide";
  const titled = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree>
<p:sp><p:nvSpPr><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>第一页标题</a:t></a:r></a:p></p:txBody></p:sp>
</p:spTree></p:cSld></p:sld>`;
  const files: Record<string, Uint8Array> = {
    "ppt/presentation.xml": strToU8(presentation(1)),
    "ppt/_rels/presentation.xml.rels": strToU8(rels([["rId1", slideType, "slides/slide1.xml"]])),
    "ppt/slides/slide1.xml": strToU8(titled),
    "ppt/slides/_rels/slide1.xml.rels": strToU8(rels([
      ["rId2", notesType, "../notesSlides/notesSlide1.xml"],
    ])),
    "ppt/notesSlides/notesSlide1.xml": strToU8(notesXml("备注正文")),
  };
  assert.deepEqual(extractDeck(zipSync(files)), [
    { index: 1, note: "备注正文\n第二段", title: "第一页标题", bullets: [], regions: [] },
  ]);
});

test("没有正文占位符时使用备注中的全部文字", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>自由文本框</a:t></a:r><a:br/><a:r><a:t>下一行</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:notes>`;
  assert.equal(notesTextFromXml(xml), "自由文本框\n下一行");
});
