export const videoFps = 30;
const ticksPerSecond = 10_000_000;

export interface TimedWord {
  text: string;
  offset: number;
  duration: number;
}

export interface Cue {
  text: string;
  start: number;
  end: number;
}

function compact(value: string): string[] {
  return [...value.replace(/\s+/g, "")];
}

/** Edge TTS wordBoundaries usually omit punctuation; do not spend spoken time on it. */
function isSkippableMark(ch: string): boolean {
  return /\p{P}|\p{S}/u.test(ch);
}

function proportional(lines: string[], audioDuration: number): Cue[] {
  const weights = lines.map((line) => Math.max(1, compact(line).length));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let start = 0;
  return lines.map((line, index) => {
    const end = index === lines.length - 1 ? audioDuration : start + (audioDuration * weights[index]) / total;
    const cue = { text: line, start, end };
    start = end;
    return cue;
  });
}

export function alignLines(lines: string[], words: TimedWord[], audioDuration: number): Cue[] {
  const usable = lines.map((line) => line.trim()).filter((line) => line.length > 0);
  if (usable.length === 0) return [];
  if (!(audioDuration > 0)) throw new Error("音频时长无效。");

  const spoken = words.flatMap((word) => {
    const chars = compact(word.text);
    if (chars.length === 0) return [];
    return chars.map((ch, index) => ({
      ch,
      end: (word.offset + (word.duration * (index + 1)) / chars.length) / ticksPerSecond,
    }));
  });
  if (spoken.length === 0) return proportional(usable, audioDuration);

  let cursor = 0;
  let start = 0;
  const cues: Cue[] = [];
  for (let index = 0; index < usable.length; index += 1) {
    const needed = compact(usable[index]);
    let matched = 0;
    let end = start;
    while (matched < needed.length && cursor < spoken.length) {
      if (spoken[cursor].ch === needed[matched]) {
        end = spoken[cursor].end;
        matched += 1;
        cursor += 1;
        continue;
      }
      if (isSkippableMark(needed[matched])) {
        matched += 1;
        continue;
      }
      if (isSkippableMark(spoken[cursor].ch)) {
        end = spoken[cursor].end;
        cursor += 1;
        continue;
      }
      end = spoken[cursor].end;
      cursor += 1;
    }
    while (matched < needed.length && isSkippableMark(needed[matched])) matched += 1;
    if (index === usable.length - 1 || end <= start) end = Math.max(end, start);
    cues.push({ text: usable[index], start, end });
    start = cues[cues.length - 1].end;
  }
  cues[cues.length - 1].end = Math.max(cues[cues.length - 1].end, audioDuration);
  if (cues[cues.length - 1].end < audioDuration) cues[cues.length - 1].end = audioDuration;
  cues[cues.length - 1].end = audioDuration;
  return cues;
}

export function framePlan(durations: number[], audioDuration: number): number[] {
  const total = Math.max(1, Math.round(audioDuration * videoFps));
  if (durations.length === 0) return [total];
  const counts = durations.map((duration) => Math.max(1, Math.round(Math.max(0, duration) * videoFps)));
  let drift = total - counts.reduce((sum, count) => sum + count, 0);
  if (drift > 0) counts[counts.length - 1] += drift;
  let index = counts.length - 1;
  while (drift < 0 && index >= 0) {
    const room = counts[index] - 1;
    const take = Math.min(room, -drift);
    counts[index] -= take;
    drift += take;
    if (take === 0) index -= 1;
  }
  return counts;
}
