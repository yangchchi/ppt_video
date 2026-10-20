import assert from "node:assert/strict";
import test from "node:test";
import { parseAvatar, portraitSlot, templates } from "../src/catalog.ts";

test("模板里的幻灯片和数字人都不超出 1920×1080", () => {
  for (const template of templates) {
    for (const rect of [template.slide, template.avatar]) {
      if (!rect) continue;
      assert.ok(rect.x >= 0 && rect.y >= 0, template.id);
      assert.ok(rect.x + rect.w <= 1920, template.id);
      assert.ok(rect.y + rect.h <= 1080, template.id);
    }
  }
});

test("没有槽位的模板不叠数字人，未选模板时肖像靠右下", () => {
  const soft = templates.find((item) => item.id === "soft");
  assert.ok(soft);
  assert.equal(portraitSlot(soft, "male"), null);
  const corner = portraitSlot(templates[0], "female");
  assert.equal(corner && corner.x + corner.w, 1920);
  assert.equal(corner && corner.y + corner.h, 1080);
  assert.equal(portraitSlot(templates[0], "none"), null);
});

test("不使用模板加三个经典模板共四个", () => {
  assert.equal(templates.length, 4);
  assert.deepEqual(templates.map((item) => item.id), ["none", "business", "spotlight", "soft"]);
});

test("数字人贴住画面底边，并靠在左缘或右缘", () => {
  for (const template of templates) {
    if (!template.avatar) continue;
    const slot = template.avatar;
    assert.equal(slot.y + slot.h, 1080, template.id);
    assert.ok(slot.x === 0 || slot.x + slot.w === 1920, template.id);
  }
});

test("旧数字人读成男性或女性", () => {
  assert.equal(parseAvatar("lecturer"), "male");
  assert.equal(parseAvatar("advisor"), "female");
  assert.equal(parseAvatar("female"), "female");
});
