import assert from "node:assert/strict";
import test from "node:test";
import { buildNarration } from "../src/pipeline/script.ts";
import type { SlideCopy } from "../src/pipeline/extractNotes.ts";

const slide: SlideCopy = {
  index: 1,
  note: "备注原文",
  title: "开场",
  bullets: ["先看范围"],
  regions: [],
};

const context = { audience: "新员工", speaker: "产品经理", goals: "讲清流程" };

test("使用备注时不混入页面文字", () => {
  assert.equal(buildNarration(slide, "notes", context, 0, 2), "备注原文");
});

test("无旁白时脚本为空", () => {
  assert.equal(buildNarration(slide, "silent", context, 0, 1), "");
});

test("根据页面文字时，受众和演讲者在第一页，学习目标在最后一页", () => {
  assert.equal(
    buildNarration(slide, "slides", context, 0, 2),
    "我是产品经理。\n这次内容面向新员工。\n开场。\n先看范围。",
  );
  assert.equal(
    buildNarration({ ...slide, index: 2 }, "slides", context, 1, 2),
    "开场。\n先看范围。\n学完后希望达到：讲清流程。",
  );
});
