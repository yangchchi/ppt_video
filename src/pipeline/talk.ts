import fs from "node:fs/promises";
import path from "node:path";
import { videoFps } from "./cues.js";
import { runCommand } from "./command.js";
import { mouthTrack, poseRuns, speakingFrames } from "./mouth.js";
import { probeDuration } from "./subtitles.js";

function samplesFromPcm(pcm: Buffer): Float32Array {
  const samples = new Float32Array(Math.floor(pcm.byteLength / 4));
  Buffer.from(samples.buffer).set(pcm.subarray(0, samples.length * 4));
  return samples;
}

function escapeConcatPath(filePath: string): string {
  return filePath.replaceAll("'", "'\\''");
}

export async function renderTalkingPortrait(portraitPath: string, audioPath: string, outputPath: string): Promise<void> {
  const duration = await probeDuration(audioPath);
  const frames = Math.max(1, Math.round(duration * videoFps));
  const sampleRate = 16_000;
  const pcmPath = `${outputPath}.pcm`;
  const listPath = `${outputPath}.concat.txt`;
  const openPath = portraitPath.replace(/\.png$/, "-talk.png");
  await runCommand("ffmpeg", [
    "-y", "-i", audioPath,
    "-ac", "1",
    "-ar", String(sampleRate),
    "-f", "f32le",
    pcmPath,
  ], 120_000);
  const poses = speakingFrames(mouthTrack(samplesFromPcm(await fs.readFile(pcmPath)), sampleRate, frames, videoFps), videoFps);
  const runs = poseRuns(poses, videoFps);
  if (runs.length === 0) {
    await runCommand("ffmpeg", [
      "-y",
      "-loop", "1",
      "-framerate", String(videoFps),
      "-t", (1 / videoFps).toFixed(3),
      "-i", portraitPath,
      "-an",
      "-vf", "scale=480:-2:flags=lanczos,format=yuva420p",
      "-c:v", "libvpx-vp9",
      "-deadline", "realtime",
      "-cpu-used", "8",
      "-b:v", "0",
      "-crf", "34",
      "-auto-alt-ref", "0",
      outputPath,
    ], 120_000);
  } else {
    const lines = ["ffconcat version 1.0"];
    for (const run of runs) {
      const file = run.open ? openPath : portraitPath;
      lines.push(`file '${escapeConcatPath(path.resolve(file))}'`);
      lines.push(`duration ${(run.frames / videoFps).toFixed(6)}`);
    }
    const last = runs[runs.length - 1].open ? openPath : portraitPath;
    lines.push(`file '${escapeConcatPath(path.resolve(last))}'`);
    await fs.writeFile(listPath, `${lines.join("\n")}\n`);
    const budget = Math.min(300_000, Math.max(60_000, runs.length * 200 + frames * 4));
    await runCommand("ffmpeg", [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-an",
      "-vf", `scale=480:-2:flags=lanczos,fps=${videoFps},format=yuva420p`,
      "-c:v", "libvpx-vp9",
      "-deadline", "realtime",
      "-cpu-used", "8",
      "-b:v", "0",
      "-crf", "34",
      "-auto-alt-ref", "0",
      "-t", (frames / videoFps).toFixed(3),
      outputPath,
    ], budget);
  }
  await fs.rm(pcmPath, { force: true });
  await fs.rm(listPath, { force: true });
}
