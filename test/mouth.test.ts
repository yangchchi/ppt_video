import assert from "node:assert/strict";
import test from "node:test";
import { mouthTrack, poseRuns, speakingFrames } from "../src/pipeline/mouth.ts";

test("安静时嘴巴闭合，出声时张开", () => {
  const sampleRate = 16_000;
  const frames = 10;
  const samples = new Float32Array(sampleRate);
  for (let index = sampleRate / 2; index < sampleRate; index += 1) {
    samples[index] = Math.sin(index / 8) * 0.4;
  }
  const levels = mouthTrack(samples, sampleRate, frames, 10);
  assert.equal(levels[0], 0);
  assert.ok(levels[7] > 0.4, String(levels[7]));
  assert.ok(levels[9] > levels[4]);
});

test("有声时换成讲话图，很短的停顿不闭嘴", () => {
  const levels = new Float32Array([0, 0, 0.9, 0.95, 0.8, 0.05, 0.9, 0.8]);
  const poses = speakingFrames(levels, 10);
  assert.equal(poses[0], 0);
  assert.equal(poses[1], 0);
  assert.equal(poses[4], 1);
  assert.equal(poses[5], 1);
  assert.equal(poses[7], 1);

  const phrase = new Float32Array(16);
  phrase[2] = 0.9;
  phrase[3] = 0.95;
  phrase[4] = 0.8;
  const held = speakingFrames(phrase, 10);
  assert.equal(held[4], 1);
  assert.equal(held[6], 1);
  assert.equal(held[7], 0);
});

test("把连续相同口型收成几段，方便用静图拼视频", () => {
  assert.deepEqual(poseRuns(new Float32Array([0, 0, 1, 1, 1, 0]), 30), [
    { open: false, frames: 2 },
    { open: true, frames: 3 },
    { open: false, frames: 1 },
  ]);
  assert.deepEqual(poseRuns(new Float32Array([1]), 30), [{ open: true, frames: 1 }]);
  assert.deepEqual(poseRuns(new Float32Array([]), 30), []);
});
