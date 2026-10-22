import {
  defaultAvatar,
  defaultAvatarCorner,
  defaultAvatarScaleNone,
  defaultTemplate,
  type AvatarCorner,
  type AvatarId,
  type TemplateId,
} from "./catalog.js";
import { emptySlideSeconds } from "./config.js";

export const effects = [
  { id: "cut", label: "直接切换" },
  { id: "fade", label: "淡入淡出" },
  { id: "slide", label: "向左滑入" },
  { id: "wipe", label: "向左擦除" },
  { id: "circle", label: "圆形展开" },
  { id: "dissolve", label: "溶解" },
  { id: "fadeblack", label: "淡入黑" },
  { id: "zoomin", label: "缩放" },
  { id: "split", label: "劈裂" },
  { id: "cover", label: "推入" },
  { id: "blinds", label: "百叶窗" },
] as const;

export const languages = [
  { id: "zh-CN", label: "普通话" },
  { id: "zh-HK", label: "粤语" },
  { id: "en-US", label: "英语" },
] as const;

export const voices = [
  { id: "zh-CN-XiaoxiaoNeural", label: "晓晓", hint: "女声", locale: "zh-CN" },
  { id: "zh-CN-XiaoyiNeural", label: "晓伊", hint: "女声", locale: "zh-CN" },
  { id: "zh-CN-YunxiNeural", label: "云希", hint: "男声", locale: "zh-CN" },
  { id: "zh-CN-YunjianNeural", label: "云健", hint: "男声", locale: "zh-CN" },
  { id: "zh-CN-YunyangNeural", label: "云扬", hint: "新闻", locale: "zh-CN" },
  { id: "zh-HK-HiuMaanNeural", label: "晓曼", hint: "女声", locale: "zh-HK" },
  { id: "zh-HK-WanLungNeural", label: "云龙", hint: "男声", locale: "zh-HK" },
  { id: "en-US-JennyNeural", label: "Jenny", hint: "女声", locale: "en-US" },
  { id: "en-US-GuyNeural", label: "Guy", hint: "男声", locale: "en-US" },
] as const;

export const tones = [
  { id: "formal", label: "正式", hint: "稍慢、稍低" },
  { id: "neutral", label: "平稳", hint: "默认" },
  { id: "vivid", label: "生动", hint: "稍快、稍高" },
] as const;

export const paces = [
  { id: "short", label: "简短", hint: "更快，空页 2 秒" },
  { id: "auto", label: "自动", hint: "空页 3 秒" },
  { id: "long", label: "充分", hint: "更慢，空页 5 秒" },
] as const;

export const layouts = [
  { id: "plain", label: "全幅页面", hint: "白边补齐到 16:9" },
  { id: "stage", label: "舞台画框", hint: "虚化背景，页面居中" },
  { id: "push", label: "缓慢推镜", hint: "画面轻微推进" },
] as const;

export const scriptSources = [
  { id: "notes", label: "使用备注", hint: "朗读演讲者备注" },
  { id: "slides", label: "根据页面文字", hint: "把标题和要点写成旁白" },
  { id: "silent", label: "无旁白", hint: "只保留画面" },
] as const;

export const importModes = [
  { id: "static", label: "静态导入", hint: "按脚本来源直接生成" },
  { id: "editable", label: "逐页脚本", hint: "生成前改每一页旁白" },
] as const;

export const captionStyles = [
  { id: "bar", label: "黑底白字", hint: "半透明黑底字幕" },
  { id: "board", label: "白底黑字", hint: "浅色底条字幕" },
  { id: "off", label: "无字幕", hint: "只保留画面与旁白" },
] as const;

export const musicTracks = [
  { id: "none", label: "无音乐", hint: "不加背景音乐" },
  { id: "hometown", label: "故乡的原风景", hint: "柔和田园氛围" },
  { id: "breeze", label: "清风漫步", hint: "轻柔漫步氛围" },
] as const;

export type EffectId = (typeof effects)[number]["id"];
export type VoiceId = (typeof voices)[number]["id"];
export type ToneId = (typeof tones)[number]["id"];
export type PaceId = (typeof paces)[number]["id"];
export type LayoutId = (typeof layouts)[number]["id"];
export type ScriptSource = (typeof scriptSources)[number]["id"];
export type ImportMode = (typeof importModes)[number]["id"];
export type CaptionStyle = (typeof captionStyles)[number]["id"];
export type MusicId = (typeof musicTracks)[number]["id"];

export const defaultEffect: EffectId = "fade";
export const defaultVoice: VoiceId = "zh-CN-XiaoxiaoNeural";
export const defaultTone: ToneId = "formal";
export const defaultPace: PaceId = "auto";
export const defaultLayout: LayoutId = "plain";
export const defaultScriptSource: ScriptSource = "notes";
export const defaultImportMode: ImportMode = "static";
export const defaultCaptionStyle: CaptionStyle = "bar";
export const defaultMusic: MusicId = "none";
export const defaultHighlight = false;

const xfadeName: Record<Exclude<EffectId, "cut">, string> = {
  fade: "fade",
  slide: "slideleft",
  wipe: "wipeleft",
  circle: "circleopen",
  dissolve: "dissolve",
  fadeblack: "fadeblack",
  zoomin: "zoomin",
  split: "vertopen",
  cover: "coverleft",
  blinds: "hlslice",
};

export function transitionName(effect: EffectId): string | null {
  if (effect === "cut") return null;
  return xfadeName[effect];
}

function parseChoice<T extends string>(value: unknown, allowed: readonly T[], fallback: T, message: string): T {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "string" && allowed.some((item) => item === value)) return value as T;
  throw new Error(message);
}

export function parseEffect(value: unknown): EffectId {
  return parseChoice(value, effects.map((item) => item.id), defaultEffect, "不支持的转场。");
}

export function parseVoice(value: unknown): VoiceId {
  return parseChoice(value, voices.map((item) => item.id), defaultVoice, "不支持的音色。");
}

export function parseTone(value: unknown): ToneId {
  return parseChoice(value, tones.map((item) => item.id), defaultTone, "不支持的语调。");
}

export function parsePace(value: unknown): PaceId {
  return parseChoice(value, paces.map((item) => item.id), defaultPace, "不支持的视频时长。");
}

export function parseLayout(value: unknown): LayoutId {
  return parseChoice(value, layouts.map((item) => item.id), defaultLayout, "不支持的画幅。");
}

export function parseScriptSource(value: unknown): ScriptSource {
  return parseChoice(value, scriptSources.map((item) => item.id), defaultScriptSource, "不支持的脚本来源。");
}

export function parseImportMode(value: unknown): ImportMode {
  return parseChoice(value, importModes.map((item) => item.id), defaultImportMode, "不支持的导入方式。");
}

export function parseCaptionStyle(value: unknown): CaptionStyle {
  return parseChoice(value, captionStyles.map((item) => item.id), defaultCaptionStyle, "不支持的字幕样式。");
}

export function parseHighlight(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return defaultHighlight;
  if (value === false || value === "false" || value === "0" || value === "off") return false;
  if (value === true || value === "true" || value === "1" || value === "on") return true;
  throw new Error("重点高亮选项无效。");
}

export function parseMusic(value: unknown): MusicId {
  if (value === undefined || value === null || value === "" || value === false || value === "false" || value === "0") {
    return defaultMusic;
  }
  if (value === true || value === "true" || value === "1") return "hometown";
  return parseChoice(value, musicTracks.map((item) => item.id), defaultMusic, "背景音乐选项无效。");
}

export function parseContext(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new Error("补充说明无效。");
  const trimmed = value.trim();
  if (trimmed.length > 80) throw new Error("补充说明不能超过 80 字。");
  return trimmed;
}

export function parseScripts(value: unknown, count: number): string[] {
  if (!Array.isArray(value) || value.length !== count) throw new Error("每一页都需要一段脚本。");
  return value.map((item, index) => {
    if (typeof item !== "string") throw new Error(`第 ${index + 1} 页脚本无效。`);
    const text = item.replace(/\r\n/g, "\n").trim();
    if (text.length > 4000) throw new Error(`第 ${index + 1} 页脚本超过 4000 字。`);
    return text;
  });
}

export interface SpeechProsody {
  rate: string;
  pitch: string;
  emptySeconds: number;
}

export function speechProsody(tone: ToneId, pace: PaceId): SpeechProsody {
  const toneRate = { formal: -8, neutral: 0, vivid: 10 }[tone];
  const paceRate = { short: 12, auto: 0, long: -10 }[pace];
  const total = Math.max(-40, Math.min(40, toneRate + paceRate));
  const pitch = { formal: "-2Hz", neutral: "+0Hz", vivid: "+2Hz" }[tone];
  const emptySeconds = { short: 2, auto: emptySlideSeconds, long: 5 }[pace];
  return {
    rate: `${total >= 0 ? "+" : ""}${total}%`,
    pitch,
    emptySeconds,
  };
}

export function previewLine(voice: VoiceId): string {
  const locale = voices.find((item) => item.id === voice)?.locale;
  if (locale === "en-US") return "This is a short preview of the selected voice.";
  return "这是当前音色和语调的试听。";
}

export interface JobSettings {
  effect: EffectId;
  voice: VoiceId;
  tone: ToneId;
  pace: PaceId;
  layout: LayoutId;
  template: TemplateId;
  avatar: AvatarId;
  avatarCorner: AvatarCorner;
  avatarScale: number;
  music: MusicId;
  highlight: boolean;
  captionStyle: CaptionStyle;
  scriptSource: ScriptSource;
  importMode: ImportMode;
  audience: string;
  speaker: string;
  goals: string;
}

export { defaultAvatarCorner, defaultAvatarScaleNone };
