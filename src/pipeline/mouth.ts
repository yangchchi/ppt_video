export function mouthTrack(samples: Float32Array, sampleRate: number, frames: number, fps: number): Float32Array {
  const out = new Float32Array(frames);
  if (frames <= 0 || sampleRate <= 0 || fps <= 0) return out;
  const hop = sampleRate / fps;
  const raw = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    const start = Math.min(samples.length, Math.floor(frame * hop));
    const end = Math.min(samples.length, Math.floor((frame + 1) * hop));
    let energy = 0;
    for (let index = start; index < end; index += 1) energy += samples[index] * samples[index];
    raw[frame] = end > start ? Math.sqrt(energy / (end - start)) : 0;
  }
  const ranked = Array.from(raw).sort((left, right) => left - right);
  const peak = ranked[Math.min(ranked.length - 1, Math.floor(ranked.length * 0.9))] || 0;
  if (peak < 0.004) return out;
  const gate = peak * 0.22;
  let opened = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    const span = Math.max(peak - gate, 0.0001);
    const target = raw[frame] <= gate ? 0 : Math.min(1, (raw[frame] - gate) / span);
    const follow = target > opened ? 0.85 : 0.62;
    opened += (target - opened) * follow;
    out[frame] = opened > 0 ? opened ** 0.72 : 0;
  }
  return out;
}

export function speakingFrames(levels: Float32Array, fps = 30): Float32Array {
  const out = new Float32Array(levels.length);
  const openAfter = Math.max(2, Math.round(fps * 0.1));
  const closeAfter = Math.max(openAfter + 1, Math.round(fps * 0.08));
  let speaking = false;
  let pending = 0;
  for (let frame = 0; frame < levels.length; frame += 1) {
    const level = levels[frame];
    const wantOpen: boolean = speaking ? level > 0.2 : level >= 0.45;
    if (wantOpen === speaking) pending = 0;
    else {
      pending += 1;
      const needed = wantOpen ? openAfter : closeAfter;
      if (pending >= needed) {
        speaking = wantOpen;
        pending = 0;
      }
    }
    out[frame] = speaking ? 1 : 0;
  }
  return out;
}

export interface PoseRun {
  open: boolean;
  frames: number;
}

export function poseRuns(poses: Float32Array, _fps = 30): PoseRun[] {
  if (poses.length === 0) return [];
  const runs: PoseRun[] = [];
  let open = poses[0] >= 0.5;
  let frames = 1;
  for (let index = 1; index < poses.length; index += 1) {
    const next = poses[index] >= 0.5;
    if (next === open) {
      frames += 1;
      continue;
    }
    runs.push({ open, frames });
    open = next;
    frames = 1;
  }
  runs.push({ open, frames });
  return runs;
}
