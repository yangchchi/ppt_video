import fs from "node:fs/promises";
import path from "node:path";
import { videoHeight, videoWidth } from "../config.js";
import { framePlan, videoFps, type Cue } from "./cues.js";
import type { AvatarCorner, AvatarId, FrameRect, TemplateDef } from "../catalog.js";
import { portraitSlot, templateById } from "../catalog.js";
import { type CaptionStyle, type EffectId, type LayoutId, type MusicId, transitionName } from "../options.js";
import { runCommand } from "./command.js";
import { burnSubtitleLine, probeDuration } from "./subtitles.js";
import { regionsForLine, type HighlightRegion } from "./highlight.js";
import type { Narration } from "./synthesize.js";
import { renderTalkingPortrait } from "./talk.js";

const frameFilter = [
  `scale=${videoWidth}:${videoHeight}:force_original_aspect_ratio=decrease`,
  `pad=${videoWidth}:${videoHeight}:(ow-iw)/2:(oh-ih)/2:color=white`,
  "fps=30",
  "setsar=1",
  "format=yuv420p",
].join(",");

function segmentFilter(layout: LayoutId, index: number, frames: number): string {
  const duration = (frames / videoFps).toFixed(3);
  const tail = `trim=duration=${duration},setpts=PTS-STARTPTS[v${index}]`;
  if (layout === "stage") {
    return [
      `[${index}:v]split[s${index}a][s${index}b]`,
      `[s${index}a]scale=${videoWidth}:${videoHeight}:force_original_aspect_ratio=increase,crop=${videoWidth}:${videoHeight},boxblur=18:6[bg${index}]`,
      `[s${index}b]scale=1600:900:force_original_aspect_ratio=decrease[fg${index}]`,
      `[bg${index}][fg${index}]overlay=(W-w)/2:(H-h)/2,fps=30,setsar=1,format=yuv420p,${tail}`,
    ].join(";");
  }
  if (layout === "push") {
    const steps = Math.max(frames - 1, 1);
    return `[${index}:v]scale=2304:1296:force_original_aspect_ratio=increase,crop=2304:1296,zoompan=z='1+0.05*on/${steps}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${videoWidth}x${videoHeight}:fps=${videoFps},setsar=1,format=yuv420p[v${index}]`;
  }
  return `[${index}:v]${frameFilter},${tail}`;
}

function avatarPlacement(slot: FrameRect, scale: number): { scale: string; x: string; y: string } {
  const width = Math.max(1, Math.round(slot.w * scale));
  const height = Math.max(1, Math.round(slot.h * scale));
  const centerX = slot.x + slot.w / 2;
  const centered = Math.abs(centerX - videoWidth / 2) < videoWidth * 0.1;
  return {
    scale: `scale=${width}:${height}:force_original_aspect_ratio=decrease,format=rgba`,
    x: centered
      ? "(main_w-overlay_w)/2"
      : centerX >= videoWidth / 2
        ? "main_w-overlay_w"
        : String(slot.x),
    y: "main_h-overlay_h",
  };
}

function templatePiece(
  index: number,
  frames: number,
  template: TemplateDef,
  avatarLabel: string | null,
  avatarStart: number,
  avatarScale: number,
): string {
  const slide = template.slide;
  if (!slide) throw new Error("模板没有画面区域。");
  const duration = (frames / videoFps).toFixed(3);
  const slot = avatarLabel ? template.avatar : null;
  const lines = [
    `color=c=0x${template.background}:s=${videoWidth}x${videoHeight}:r=${videoFps}:d=${duration}[bg${index}]`,
    `[${index}:v]scale=${slide.w}:${slide.h}:force_original_aspect_ratio=decrease,pad=${slide.w}:${slide.h}:(ow-iw)/2:(oh-ih)/2:color=white[sl${index}]`,
    `[bg${index}][sl${index}]overlay=${slide.x}:${slide.y}:format=auto[mid${index}]`,
  ];
  if (slot && avatarLabel) {
    const place = avatarPlacement(slot, avatarScale);
    lines.push(
      `${avatarLabel}trim=start=${avatarStart.toFixed(3)}:duration=${duration},setpts=PTS-STARTPTS,${place.scale}[av${index}]`,
    );
    lines.push(
      `[mid${index}][av${index}]overlay=x=${place.x}:y=${place.y}:format=auto,fps=${videoFps},setsar=1,format=yuv420p,trim=duration=${duration},setpts=PTS-STARTPTS[v${index}]`,
    );
  } else {
    lines.push(`[mid${index}]fps=${videoFps},setsar=1,format=yuv420p,trim=duration=${duration},setpts=PTS-STARTPTS[v${index}]`);
  }
  return lines.join(";");
}

async function renderSlide(
  images: string[],
  frameCounts: number[],
  audio: string,
  segment: string,
  layout: LayoutId,
  template: TemplateDef,
  avatarPath: string | null,
  avatarScale: number,
): Promise<void> {
  const totalFrames = frameCounts.reduce((sum, count) => sum + count, 0);
  const duration = (totalFrames / videoFps).toFixed(3);
  const framed = template.slide !== null;
  const useAvatar = Boolean(avatarPath && (framed ? template.avatar : false));
  const avatarIndex = images.length;
  let filters: string[];
  if (framed) {
    const avatarLead = useAvatar
      ? images.length === 1
        ? ""
        : `[${avatarIndex}:v]format=rgba,split=${images.length}${images.map((_, index) => `[avs${index}]`).join("")};`
      : "";
    let avatarCursor = 0;
    filters = images.map((_, index) => {
      const start = avatarCursor / videoFps;
      avatarCursor += frameCounts[index];
      return templatePiece(
        index,
        frameCounts[index],
        template,
        useAvatar ? (images.length === 1 ? `[${avatarIndex}:v]` : `[avs${index}]`) : null,
        start,
        avatarScale,
      );
    });
    filters.unshift(avatarLead.replace(/;$/, ""));
    filters = filters.filter((item) => item.length > 0);
  } else {
    filters = images.map((_, index) => segmentFilter(layout, index, frameCounts[index]));
  }
  const concat = `${images.map((_, index) => `[v${index}]`).join("")}concat=n=${images.length}:v=1:a=0[v]`;
  const audioIndex = images.length + (useAvatar ? 1 : 0);
  await runCommand(
    "ffmpeg",
    [
      "-y",
      ...images.flatMap((image, index) => !framed && layout === "push"
        ? ["-i", image]
        : [
          "-loop", "1",
          "-framerate", String(videoFps),
          "-t", (frameCounts[index] / videoFps).toFixed(3),
          "-i", image,
        ]),
      ...(useAvatar && avatarPath ? ["-c:v", "libvpx-vp9", "-i", avatarPath] : []),
      "-i", audio,
      "-filter_complex", `${filters.join(";")};${concat}`,
      "-map", "[v]",
      "-map", `${audioIndex}:a`,
      "-t", duration,
      "-c:v", "libx264",
      "-tune", "stillimage",
      "-c:a", "aac",
      "-b:a", "160k",
      "-ar", "44100",
      "-ac", "2",
      "-r", String(videoFps),
      "-muxdelay", "0",
      "-muxpreload", "0",
      "-movflags", "+faststart",
      "-pix_fmt", "yuv420p",
      segment,
    ],
    180_000,
  );
}

async function slideFrames(
  image: string,
  lines: Cue[],
  audioDuration: number,
  workDir: string,
  slideIndex: number,
  regions: HighlightRegion[],
  highlight: boolean,
  captionStyle: CaptionStyle,
): Promise<{ images: string[]; frames: number[] }> {
  if (lines.length === 0 || captionStyle === "off") {
    return { images: [image], frames: framePlan([audioDuration], audioDuration) };
  }
  const durations = lines.map((line, index) => {
    const span = Math.max(0, line.end - line.start);
    return index === lines.length - 1 ? Math.max(span, audioDuration - line.start) : span;
  });
  const frames = framePlan(durations, audioDuration);
  const images: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const output = path.join(workDir, `slide-${String(slideIndex).padStart(3, "0")}-line-${String(index + 1).padStart(3, "0")}.png`);
    await burnSubtitleLine(
      image,
      lines[index].text,
      output,
      highlight ? regionsForLine(lines[index].text, regions) : [],
      captionStyle === "board" ? "board" : "bar",
    );
    images.push(output);
  }
  return { images, frames };
}

async function concatCopy(segments: string[], output: string, listPath: string): Promise<void> {
  if (segments.length === 1) {
    await fs.copyFile(segments[0], output);
    return;
  }
  await fs.writeFile(listPath, segments.map((item) => `file '${item.replaceAll("'", "'\\''")}'`).join("\n"));
  await runCommand("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-movflags", "+faststart", output]);
}

async function concatTransition(segments: string[], output: string, effect: Exclude<EffectId, "cut">): Promise<void> {
  const durations = await Promise.all(segments.map((segment) => probeDuration(segment)));
  const transition = transitionName(effect);
  if (!transition) throw new Error("转场参数无效。");
  const filters: string[] = [];
  let videoLabel = "[0:v]";
  let audioLabel = "[0:a]";
  let offset = 0;

  for (let index = 1; index < segments.length; index += 1) {
    const previous = durations[index - 1];
    const current = durations[index];
    const duration = Math.min(0.5, previous / 3, current / 3);
    const last = index === segments.length - 1;
    const nextVideo = last ? "[vout]" : `[v${index}]`;
    const nextAudio = last ? "[aout]" : `[a${index}]`;
    if (duration < 0.12) {
      filters.push(`${videoLabel}[${index}:v]concat=n=2:v=1:a=0${nextVideo}`);
      filters.push(`${audioLabel}[${index}:a]concat=n=2:v=0:a=1${nextAudio}`);
      offset += previous;
    } else {
      offset += previous - duration;
      filters.push(
        `${videoLabel}[${index}:v]xfade=transition=${transition}:duration=${duration.toFixed(3)}:offset=${offset.toFixed(3)}${nextVideo}`,
      );
      filters.push(`${audioLabel}[${index}:a]acrossfade=d=${duration.toFixed(3)}:c1=tri:c2=tri${nextAudio}`);
    }
    videoLabel = nextVideo;
    audioLabel = nextAudio;
  }

  await runCommand(
    "ffmpeg",
    [
      "-y",
      ...segments.flatMap((segment) => ["-i", segment]),
      "-filter_complex", filters.join(";"),
      "-map", "[vout]",
      "-map", "[aout]",
      "-c:v", "libx264",
      "-c:a", "aac",
      "-b:a", "160k",
      "-movflags", "+faststart",
      "-pix_fmt", "yuv420p",
      output,
    ],
    300_000,
  );
}

async function makeBed(track: Exclude<MusicId, "none">, bed: string): Promise<void> {
  const beds: Record<Exclude<MusicId, "none">, string[]> = {
    hometown: [
      "-y",
      "-f", "lavfi", "-i", "sine=frequency=196:sample_rate=44100:duration=16",
      "-f", "lavfi", "-i", "sine=frequency=246.94:sample_rate=44100:duration=16",
      "-f", "lavfi", "-i", "sine=frequency=293.66:sample_rate=44100:duration=16",
      "-filter_complex",
      "[0:a][1:a][2:a]amix=inputs=3:duration=first:normalize=0,lowpass=f=780,highpass=f=140,volume=0.18,afade=t=in:d=2,afade=t=out:st=13.5:d=2.5[a]",
      "-map", "[a]",
      "-c:a", "aac",
      "-t", "16",
      bed,
    ],
    breeze: [
      "-y",
      "-f", "lavfi", "-i", "sine=frequency=174.61:sample_rate=44100:duration=16",
      "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=44100:duration=16",
      "-f", "lavfi", "-i", "sine=frequency=329.63:sample_rate=44100:duration=16",
      "-filter_complex",
      "[0:a][1:a][2:a]amix=inputs=3:duration=first:normalize=0,lowpass=f=960,highpass=f=110,volume=0.16,afade=t=in:d=2.2,afade=t=out:st=13.2:d=2.8[a]",
      "-map", "[a]",
      "-c:a", "aac",
      "-t", "16",
      bed,
    ],
  };
  await runCommand("ffmpeg", beds[track]);
}

async function mixBed(video: string, workDir: string, track: Exclude<MusicId, "none">): Promise<void> {
  const bed = path.join(workDir, "bed.m4a");
  const mixed = path.join(workDir, "output-music.mp4");
  await makeBed(track, bed);
  await runCommand("ffmpeg", [
    "-y",
    "-i", video,
    "-stream_loop", "-1",
    "-i", bed,
    "-filter_complex", "[1:a]volume=0.16[bed];[0:a][bed]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]",
    "-map", "0:v",
    "-map", "[a]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "160k",
    "-shortest",
    mixed,
  ], 180_000);
  await fs.rm(video, { force: true });
  await fs.rename(mixed, video);
}

async function overlayCorner(
  video: string,
  avatarPath: string,
  corner: AvatarCorner,
  avatarScale: number,
): Promise<void> {
  const mixed = `${video}.corner.mp4`;
  const slot = portraitSlot(templateById("none")!, "male", corner);
  if (!slot) return;
  const place = avatarPlacement(slot, avatarScale);
  await runCommand("ffmpeg", [
    "-y",
    "-i", video,
    "-c:v", "libvpx-vp9",
    "-i", avatarPath,
    "-filter_complex",
    `[1:v]${place.scale}[av];[0:v][av]overlay=x=${place.x}:y=${place.y}:format=auto:eof_action=repeat,format=yuv420p[v]`,
    "-map", "[v]",
    "-map", "0:a",
    "-c:v", "libx264",
    "-c:a", "copy",
    "-movflags", "+faststart",
    "-pix_fmt", "yuv420p",
    mixed,
  ], 180_000);
  await fs.rm(video, { force: true });
  await fs.rename(mixed, video);
}

export async function composeVideo(
  images: string[],
  narrations: Narration[],
  effect: EffectId,
  layout: LayoutId,
  music: MusicId,
  highlight: boolean,
  captionStyle: CaptionStyle,
  regions: HighlightRegion[][],
  templateId: string,
  avatar: AvatarId,
  avatarPath: string | null,
  avatarCorner: AvatarCorner,
  avatarScale: number,
  workDir: string,
  onProgress?: (current: number, total: number) => void,
): Promise<string> {
  if (images.length !== narrations.length) throw new Error("画面数量和语音数量不一致。");
  const captionDir = path.join(workDir, "captions");
  const segmentDir = path.join(workDir, "segments");
  await fs.mkdir(captionDir, { recursive: true });
  await fs.mkdir(segmentDir, { recursive: true });
  const template = templateById(templateId) ?? templateById("none");
  if (!template) throw new Error("不支持的模板。");
  const segments: string[] = [];

  for (let index = 0; index < images.length; index += 1) {
    onProgress?.(index + 1, images.length);
    const narration = narrations[index];
    const audioDuration = await probeDuration(narration.audioPath);
    const prepared = await slideFrames(
      images[index],
      narration.lines,
      audioDuration,
      captionDir,
      index + 1,
      regions[index] ?? [],
      highlight,
      captionStyle,
    );
    const segment = path.join(segmentDir, `slide-${String(index + 1).padStart(3, "0")}.mp4`);
    let segmentAvatar: string | null = null;
    if (avatarPath && template.slide && template.avatar) {
      segmentAvatar = path.join(segmentDir, `talk-${String(index + 1).padStart(3, "0")}.webm`);
      await renderTalkingPortrait(avatarPath, narration.audioPath, segmentAvatar);
    }
    await renderSlide(
      prepared.images,
      prepared.frames,
      narration.audioPath,
      segment,
      layout,
      template,
      segmentAvatar,
      avatarScale,
    );
    segments.push(segment);
  }

  const output = path.join(workDir, "output.mp4");
  if (effect === "cut" || segments.length === 1) {
    await concatCopy(segments, output, path.join(segmentDir, "concat.txt"));
  } else {
    await concatTransition(segments, output, effect);
  }
  if (template.slide === null && avatar !== "none" && avatarPath) {
    const clip = path.join(workDir, "talking.webm");
    await renderTalkingPortrait(avatarPath, output, clip);
    await overlayCorner(output, clip, avatarCorner, avatarScale);
  }
  if (music !== "none") await mixBed(output, workDir, music);
  return output;
}
