import assert from "node:assert/strict";
import test from "node:test";
import { canDeleteJob } from "../src/jobs.ts";

test("草稿与成片可删，处理中与失败不可删", () => {
  assert.equal(canDeleteJob("draft"), true);
  assert.equal(canDeleteJob("done"), true);
  assert.equal(canDeleteJob("queued"), false);
  assert.equal(canDeleteJob("running"), false);
  assert.equal(canDeleteJob("failed"), false);
});
