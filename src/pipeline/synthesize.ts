import fs from "node:fs/promises";
import path from "node:path";
import { ttsVoice } from "../config.js";
import { speechProsody, type SpeechProsody } from "../options.js";
import { alignLines, type Cue, type TimedWord } from "./cues.js";
import { runCommand } from "./command.js";
import { probeDuration, wrapSubtitleLines } from "./subtitles.js";

export interface Narration {
  audioPath: string;
  lines: Cue[];
}

interface SpokenChunk {
  path: string;
  words: TimedWord[];
}

function splitScript(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= 500) return [trimmed];
  const pieces = trimmed.split(/(?<=[。！？!?])|\n+/).map((piece) => piece.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if ((current + piece).length > 500 && current) {
      chunks.push(current);
      current = piece;
    } else {
      current += piece;
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [trimmed];
}

async function synthesizeChunk(
  text: string,
  filePath: string,
  voice: string,
  prosody: SpeechProsody,
): Promise<TimedWord[]> {
  const { EdgeTTS } = await import("@andresaya/edge-tts");
  const client = new EdgeTTS();
  const result = await client.generate(text, voice, {
    rate: prosody.rate,
    pitch: prosody.pitch,
    outputFormat: "audio-24khz-96kbitrate-mono-mp3",
  });
  await fs.writeFile(filePath, Buffer.from(result.audio));
  return result.wordBoundaries.map((word) => ({
    text: word.text,
    offset: word.offset,
    duration: word.duration,
  }));
}

async function silence(filePath: string, seconds: number): Promise<void> {
  await runCommand("ffmpeg", [
    "-y",
    "-f", "lavfi",
    "-i", "anullsrc=r=44100:cl=stereo",
    "-t", seconds.toFixed(3),
    "-c:a", "libmp3lame",
    "-q:a", "6",
    filePath,
  ]);
}

async function concatAudio(chunks: SpokenChunk[], filePath: string, listPath: string): Promise<TimedWord[]> {
  const words: TimedWord[] = [];
  let shiftTicks = 0;
  for (const chunk of chunks) {
    const duration = await probeDuration(chunk.path);
    for (const word of chunk.words) {
      words.push({
        text: word.text,
        offset: word.offset + shiftTicks,
        duration: word.duration,
      });
    }
    shiftTicks += Math.round(duration * 10_000_000);
  }
  await fs.writeFile(listPath, chunks.map((chunk) => `file '${chunk.path.replaceAll("'", "'\\''")}'`).join("\n"));
  await runCommand("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c:a", "libmp3lame", "-q:a", "4", filePath]);
  return words;
}

export async function synthesizePreview(
  text: string,
  voice: string,
  prosody: SpeechProsody,
  filePath: string,
): Promise<void> {
  await synthesizeChunk(text, filePath, voice, prosody);
}

export async function synthesizeNotes(
  notes: string[],
  images: string[],
  workDir: string,
  voice = ttsVoice,
  prosody: SpeechProsody = speechProsody("neutral", "auto"),
): Promise<Narration[]> {
  if (notes.length !== images.length) throw new Error("备注数量和画面数量不一致。");
  const audioDir = path.join(workDir, "audio");
  await fs.mkdir(audioDir, { recursive: true });
  const narrations: Narration[] = [];

  for (let index = 0; index < notes.length; index += 1) {
    const filePath = path.join(audioDir, `slide-${String(index + 1).padStart(3, "0")}.mp3`);
    const note = notes[index].trim();
    if (!note) {
      await silence(filePath, prosody.emptySeconds);
      narrations.push({ audioPath: filePath, lines: [] });
      continue;
    }

    const lines = await wrapSubtitleLines(images[index], note, path.join(audioDir, `wrap-${index + 1}`));
    const chunks = splitScript(note);
    const spoken: SpokenChunk[] = [];
    try {
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        const chunkPath = chunks.length === 1
          ? filePath
          : path.join(audioDir, `slide-${String(index + 1).padStart(3, "0")}-${chunkIndex}.mp3`);
        const words = await synthesizeChunk(chunks[chunkIndex], chunkPath, voice, prosody);
        spoken.push({ path: chunkPath, words });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`第 ${index + 1} 页语音合成失败：${detail}`);
    }

    const words = spoken.length === 1
      ? spoken[0].words
      : await concatAudio(spoken, filePath, path.join(audioDir, `slide-${String(index + 1).padStart(3, "0")}.txt`));
    const duration = await probeDuration(filePath);
    narrations.push({
      audioPath: filePath,
      lines: alignLines(lines.length > 0 ? lines : [note], words, duration),
    });
  }

  return narrations;
}
