import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFontConfigXml,
  buildRegistryModificationsXml,
  candidateFontFiles,
  officeFontAliases,
  officeFontStack,
  resolveOfficeFont,
} from "../src/pipeline/officeFonts.js";

test("font stack prefers Noto, then PingFang, then YaHei", () => {
  assert.deepEqual([...officeFontStack], ["Noto Sans SC", "PingFang SC", "Microsoft YaHei"]);
});

test("mac candidates put PingFang before YaHei paths", () => {
  const mac = candidateFontFiles("darwin");
  assert.equal(mac[0].family, "Noto Sans SC");
  assert.equal(mac[1].family, "PingFang SC");
  assert.equal(mac[2].family, "Microsoft YaHei");
  assert.ok(mac[1].paths.some((item) => item.includes("PingFang")));
});

test("fontconfig prefer list keeps the full stack", () => {
  const prefer = [...officeFontStack];
  const xml = buildFontConfigXml(["/tmp/fonts"], prefer);
  assert.match(xml, /<dir>\/tmp\/fonts<\/dir>/);
  assert.match(xml, /Microsoft YaHei/);
  assert.match(xml, /<family>sans-serif<\/family>/);
  assert.match(xml, /Noto Sans SC[\s\S]*PingFang SC[\s\S]*Microsoft YaHei/);
});

test("registry replaces common fonts with the chosen primary", () => {
  const xml = buildRegistryModificationsXml("PingFang SC");
  assert.match(xml, /ReplacementList/);
  for (const family of ["Microsoft YaHei", "微软雅黑", "SimSun", "黑体"]) {
    assert.ok(officeFontAliases.includes(family));
    assert.match(xml, new RegExp(family));
  }
  assert.match(xml, /PingFang SC/);
});

test("resolveOfficeFont finds a usable family on this machine", async () => {
  const resolved = await resolveOfficeFont();
  assert.ok(officeFontStack.includes(resolved.family as (typeof officeFontStack)[number]));
  assert.deepEqual(resolved.prefer, [...officeFontStack]);
  assert.ok(resolved.filePath);
});
