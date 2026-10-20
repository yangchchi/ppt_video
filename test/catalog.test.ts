import assert from "node:assert/strict";
import test from "node:test";
import {
  parseAvatar,
  parseAvatarCorner,
  parseAvatarScale,
  parseTemplate,
  portraitSlot,
  templates,
} from "../src/catalog.ts";

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

test("未选模板时肖像按布局贴底", () => {
  const none = templates.find((item) => item.id === "none");
  assert.ok(none);
  const right = portraitSlot(none, "female", "right");
  assert.equal(right && right.x + right.w, 1920);
  assert.equal(right && right.y + right.h, 1080);
  const left = portraitSlot(none, "female", "left");
  assert.equal(left && left.x, 0);
  const center = portraitSlot(none, "female", "center");
  assert.equal(center && center.x * 2 + center.w, 1920);
  assert.equal(portraitSlot(none, "none"), null);
});

test("不使用模板加左右布局共三个", () => {
  assert.equal(templates.length, 3);
  assert.deepEqual(templates.map((item) => item.id), ["none", "left", "right"]);
});

test("左布局与右布局镜像，数字人贴底并贴对应侧缘", () => {
  const left = templates.find((item) => item.id === "left");
  const right = templates.find((item) => item.id === "right");
  assert.ok(left?.avatar && right?.avatar && left.slide && right.slide);
  assert.equal(left.avatar.x, 0);
  assert.equal(left.avatar.y + left.avatar.h, 1080);
  assert.equal(right.avatar.x + right.avatar.w, 1920);
  assert.equal(right.avatar.y + right.avatar.h, 1080);
  assert.equal(left.avatar.w, right.avatar.w);
  assert.equal(left.slide.w, right.slide.w);
});

test("旧模板读成新布局", () => {
  assert.equal(parseTemplate("business"), "right");
  assert.equal(parseTemplate("spotlight"), "right");
  assert.equal(parseTemplate("soft"), "none");
  assert.equal(parseTemplate("center"), "none");
  assert.equal(parseTemplate("lecture"), "right");
});

test("数字人比例限制在 30% 到 150%", () => {
  assert.equal(parseAvatarScale(undefined, "none"), 0.4);
  assert.equal(parseAvatarScale(undefined, "left"), 1);
  assert.equal(parseAvatarScale(0.2, "none"), 0.3);
  assert.equal(parseAvatarScale(2, "right"), 1.5);
  assert.equal(parseAvatarCorner("center"), "center");
});

test("旧数字人读成男性或女性", () => {
  assert.equal(parseAvatar("lecturer"), "male");
  assert.equal(parseAvatar("advisor"), "female");
  assert.equal(parseAvatar("female"), "female");
});
