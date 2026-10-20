import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";

export interface SlideNote {
  index: number;
  text: string;
}

export interface SlideRegion {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SlideCopy {
  index: number;
  note: string;
  title: string;
  bullets: string[];
  regions: SlideRegion[];
}

const structParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => name === "p:sldId" || name === "Relationship",
});

const orderParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  trimValues: false,
});

type XmlNode = Record<string, unknown>;

function asNodes(value: unknown): XmlNode[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is XmlNode => !!item && typeof item === "object");
}

function tagOf(node: XmlNode): string {
  return Object.keys(node).find((key) => key !== ":@") ?? "";
}

function localName(tag: string): string {
  const index = tag.lastIndexOf(":");
  return index === -1 ? tag : tag.slice(index + 1);
}

function childrenOf(node: XmlNode): XmlNode[] {
  const tag = tagOf(node);
  if (!tag) return [];
  return asNodes(node[tag]);
}

function attrsOf(node: XmlNode): Record<string, string> {
  const attrs = node[":@"];
  if (!attrs || typeof attrs !== "object") return {};
  return attrs as Record<string, string>;
}

function textOf(node: XmlNode): string {
  const tag = tagOf(node);
  const value = node[tag];
  if (typeof value === "string" || typeof value === "number") return String(value);
  let text = "";
  for (const child of asNodes(value)) {
    if ("#text" in child) text += String(child["#text"] ?? "");
  }
  return text;
}

function walk(node: XmlNode, visit: (node: XmlNode) => void): void {
  visit(node);
  for (const child of childrenOf(node)) walk(child, visit);
}

function isBodyPlaceholder(node: XmlNode): boolean {
  return localName(tagOf(node)) === "ph" && attrsOf(node)["@_type"] === "body";
}

function shapeIsNotesBody(node: XmlNode): boolean {
  if (localName(tagOf(node)) !== "sp") return false;
  let found = false;
  walk(node, (current) => {
    if (isBodyPlaceholder(current)) found = true;
  });
  return found;
}

function renderParagraph(node: XmlNode): string {
  let text = "";
  for (const child of childrenOf(node)) {
    const name = localName(tagOf(child));
    if (name === "br") {
      text += "\n";
      continue;
    }
    if (name === "r" || name === "fld") {
      walk(child, (current) => {
        if (localName(tagOf(current)) === "t") text += textOf(current);
      });
      continue;
    }
    if (name === "t") text += textOf(child);
  }
  return text;
}

function paragraphsIn(node: XmlNode): string[] {
  const paragraphs: string[] = [];
  walk(node, (current) => {
    if (localName(tagOf(current)) === "p") paragraphs.push(renderParagraph(current));
  });
  return paragraphs;
}

function normalizeNote(parts: string[]): string {
  return parts
    .map((part) => part.replace(/[ \t]+\n/g, "\n").trim())
    .filter((part) => part.length > 0)
    .join("\n")
    .trim();
}

const skippedPlaceholders = new Set(["sldNum", "dt", "ftr", "hdr", "sldImg"]);
const titlePlaceholders = new Set(["title", "ctrTitle"]);
const bodyPlaceholders = new Set(["body", "subTitle", "obj"]);

function shapePlaceholderType(node: XmlNode): string | null {
  let found: string | null = null;
  let hasPlaceholder = false;
  walk(node, (current) => {
    if (localName(tagOf(current)) !== "ph") return;
    hasPlaceholder = true;
    found = attrsOf(current)["@_type"] ?? "body";
  });
  return hasPlaceholder ? found : null;
}

function shapeText(node: XmlNode): string {
  return paragraphsIn(node).map((part) => part.trim()).filter((part) => part.length > 0).join("\n");
}

function shapeBox(node: XmlNode): { x: number; y: number; w: number; h: number } | null {
  let box: { x: number; y: number; w: number; h: number } | null = null;
  walk(node, (current) => {
    if (box || localName(tagOf(current)) !== "xfrm") return;
    let x = Number.NaN;
    let y = Number.NaN;
    let w = Number.NaN;
    let h = Number.NaN;
    for (const child of childrenOf(current)) {
      const name = localName(tagOf(child));
      const attrs = attrsOf(child);
      if (name === "off") {
        x = Number(attrs["@_x"]);
        y = Number(attrs["@_y"]);
      }
      if (name === "ext") {
        w = Number(attrs["@_cx"]);
        h = Number(attrs["@_cy"]);
      }
    }
    if ([x, y, w, h].every((value) => Number.isFinite(value)) && w > 0 && h > 0) {
      box = { x, y, w, h };
    }
  });
  return box;
}

function collectShapes(node: XmlNode, insideGroup: boolean, shapes: XmlNode[]): void {
  const name = localName(tagOf(node));
  if (name === "grpSp") {
    for (const child of childrenOf(node)) collectShapes(child, true, shapes);
    return;
  }
  if (name === "sp" && !insideGroup) shapes.push(node);
  for (const child of childrenOf(node)) collectShapes(child, insideGroup, shapes);
}

export function slideRegionsFromXml(xml: string, slideWidth: number, slideHeight: number): SlideRegion[] {
  if (!(slideWidth > 0) || !(slideHeight > 0)) return [];
  const shapes: XmlNode[] = [];
  for (const root of asNodes(orderParser.parse(xml))) collectShapes(root, false, shapes);
  const regions: SlideRegion[] = [];
  for (const shape of shapes) {
    const type = shapePlaceholderType(shape);
    if (type && skippedPlaceholders.has(type)) continue;
    const text = shapeText(shape);
    const box = shapeBox(shape);
    if (!text || !box) continue;
    regions.push({
      text,
      x: box.x / slideWidth,
      y: box.y / slideHeight,
      w: box.w / slideWidth,
      h: box.h / slideHeight,
    });
  }
  return regions;
}

export function slideCopyFromXml(xml: string): { title: string; bullets: string[] } {
  const roots = asNodes(orderParser.parse(xml));
  const shapes: Array<{ type: string | null; paragraphs: string[] }> = [];
  for (const root of roots) {
    walk(root, (node) => {
      if (localName(tagOf(node)) !== "sp") return;
      const type = shapePlaceholderType(node);
      if (type && skippedPlaceholders.has(type)) return;
      const paragraphs = paragraphsIn(node).map((part) => part.trim()).filter((part) => part.length > 0);
      if (paragraphs.length === 0) return;
      shapes.push({ type, paragraphs });
    });
  }

  const titleParts = shapes
    .filter((shape) => shape.type !== null && titlePlaceholders.has(shape.type))
    .flatMap((shape) => shape.paragraphs);
  let bulletParts = shapes
    .filter((shape) => shape.type === null || bodyPlaceholders.has(shape.type))
    .flatMap((shape) => shape.paragraphs);

  if (titleParts.length === 0 && bulletParts.length > 0) {
    titleParts.push(bulletParts[0]);
    bulletParts = bulletParts.slice(1);
  }

  return {
    title: titleParts.join("\n").trim(),
    bullets: bulletParts,
  };
}

export function notesTextFromXml(xml: string): string {
  const roots = asNodes(orderParser.parse(xml));
  const bodyParts: string[] = [];
  for (const root of roots) {
    walk(root, (node) => {
      if (!shapeIsNotesBody(node)) return;
      bodyParts.push(...paragraphsIn(node));
    });
  }
  const body = normalizeNote(bodyParts);
  if (body) return body;

  const allParts: string[] = [];
  for (const root of roots) allParts.push(...paragraphsIn(root));
  return normalizeNote(allParts);
}

function readXml(files: Record<string, Uint8Array>, filePath: string): string {
  const bytes = files[filePath];
  if (!bytes) throw new Error(`演示文稿缺少 ${filePath}`);
  return strFromU8(bytes);
}

function relationshipMap(xml: string): Map<string, { type: string; target: string }> {
  const doc = structParser.parse(xml) as {
    Relationships?: { Relationship?: Array<Record<string, string>> };
  };
  const map = new Map<string, { type: string; target: string }>();
  for (const rel of doc.Relationships?.Relationship ?? []) {
    map.set(rel["@_Id"], { type: rel["@_Type"], target: rel["@_Target"] });
  }
  return map;
}

function joinRelative(baseDir: string, target: string): string {
  const parts = baseDir.split("/").filter(Boolean);
  for (const part of target.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== "." && part !== "") parts.push(decodeURIComponent(part));
  }
  return parts.join("/");
}

export function extractDeck(pptx: Uint8Array): SlideCopy[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(pptx);
  } catch {
    throw new Error("文件不是有效的演示文稿包。");
  }
  if (!files["ppt/presentation.xml"]) throw new Error("文件不是有效的演示文稿包。");

  const presentationXml = readXml(files, "ppt/presentation.xml");
  const presentation = structParser.parse(presentationXml) as {
    "p:presentation"?: {
      "p:sldIdLst"?: { "p:sldId"?: Array<Record<string, string>> };
      "p:sldSz"?: Record<string, string>;
    };
  };
  const size = presentation["p:presentation"]?.["p:sldSz"];
  const slideWidth = Number(size?.["@_cx"]) > 0 ? Number(size?.["@_cx"]) : 12_192_000;
  const slideHeight = Number(size?.["@_cy"]) > 0 ? Number(size?.["@_cy"]) : 6_858_000;
  const slideIds = presentation["p:presentation"]?.["p:sldIdLst"]?.["p:sldId"] ?? [];
  if (slideIds.length === 0) throw new Error("演示文稿里没有幻灯片。");

  const presentationRels = relationshipMap(readXml(files, "ppt/_rels/presentation.xml.rels"));

  return slideIds.map((slideId, offset) => {
    const rel = presentationRels.get(slideId["@_r:id"]);
    if (!rel) throw new Error(`第 ${offset + 1} 页缺少幻灯片关系。`);
    const slidePath = joinRelative("ppt", rel.target);
    const relsPath = slidePath.replace(/^(.*\/)?([^/]+)$/, (_, dir: string | undefined, file: string) => {
      return `${dir ?? ""}_rels/${file}.rels`;
    });
    let note = "";
    if (files[relsPath]) {
      const slideRels = relationshipMap(readXml(files, relsPath));
      const notesRel = [...slideRels.values()].find((item) => item.type.endsWith("/notesSlide"));
      if (notesRel) {
        const notesPath = joinRelative(slidePath.split("/").slice(0, -1).join("/"), notesRel.target);
        if (!files[notesPath]) throw new Error(`第 ${offset + 1} 页的备注文件缺失。`);
        note = notesTextFromXml(readXml(files, notesPath));
      }
    }
    const slideXml = readXml(files, slidePath);
    const copy = slideCopyFromXml(slideXml);
    return {
      index: offset + 1,
      note,
      title: copy.title,
      bullets: copy.bullets,
      regions: slideRegionsFromXml(slideXml, slideWidth, slideHeight),
    };
  });
}

export function extractNotes(pptx: Uint8Array): SlideNote[] {
  return extractDeck(pptx).map((slide) => ({ index: slide.index, text: slide.note }));
}
