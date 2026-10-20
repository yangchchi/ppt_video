import type { ScriptSource } from "../options.js";
import type { SlideCopy } from "./extractNotes.js";

export interface ScriptContext {
  audience: string;
  speaker: string;
  goals: string;
}

function sentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (/[。！？!?]$/.test(trimmed)) return trimmed;
  return `${trimmed}。`;
}

export function buildNarration(
  slide: SlideCopy,
  source: ScriptSource,
  context: ScriptContext,
  index: number,
  count: number,
): string {
  if (source === "silent") return "";
  if (source === "notes") return slide.note.trim();

  const lines: string[] = [];
  if (index === 0) {
    if (context.speaker.trim()) lines.push(sentence(`我是${context.speaker.trim()}`));
    if (context.audience.trim()) lines.push(sentence(`这次内容面向${context.audience.trim()}`));
  }
  if (slide.title.trim()) lines.push(sentence(slide.title.trim()));
  for (const bullet of slide.bullets) {
    const line = sentence(bullet);
    if (line) lines.push(line);
  }
  if (index === count - 1 && context.goals.trim()) {
    lines.push(sentence(`学完后希望达到：${context.goals.trim()}`));
  }
  return lines.join("\n");
}
