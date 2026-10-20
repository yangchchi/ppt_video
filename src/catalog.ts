export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TemplateDef {
  id: string;
  label: string;
  category: string;
  recommended: boolean;
  background: string;
  slide: FrameRect | null;
  avatar: FrameRect | null;
  defaultAvatar: string;
}

export const avatars = [
  { id: "none", label: "无数字人", hint: "只保留版式" },
  { id: "male", label: "男性", hint: "讲解" },
  { id: "female", label: "女性", hint: "讲解" },
] as const;

export const avatarCorners = [
  { id: "left", label: "左" },
  { id: "center", label: "中" },
  { id: "right", label: "右" },
] as const;

export const templates: TemplateDef[] = [
  {
    id: "none",
    label: "不使用模板",
    category: "经典",
    recommended: true,
    background: "FFFFFF",
    slide: null,
    avatar: null,
    defaultAvatar: "none",
  },
  {
    id: "left",
    label: "左布局",
    category: "经典",
    recommended: true,
    background: "1A2744",
    slide: { x: 520, y: 80, w: 1360, h: 920 },
    avatar: { x: 0, y: 0, w: 520, h: 1080 },
    defaultAvatar: "female",
  },
  {
    id: "right",
    label: "右布局",
    category: "经典",
    recommended: true,
    background: "1A2744",
    slide: { x: 40, y: 80, w: 1360, h: 920 },
    avatar: { x: 1400, y: 0, w: 520, h: 1080 },
    defaultAvatar: "female",
  },
];

export type AvatarId = (typeof avatars)[number]["id"];
export type AvatarCorner = (typeof avatarCorners)[number]["id"];
export type TemplateId = (typeof templates)[number]["id"];

export const defaultTemplate: TemplateId = "none";
export const defaultAvatar: AvatarId = "none";
export const defaultAvatarCorner: AvatarCorner = "right";
export const defaultAvatarScaleNone = 0.4;
export const defaultAvatarScaleTemplate = 1;

const retiredTemplates: Record<string, TemplateId> = {
  lecture: "right",
  briefing: "right",
  release: "right",
  market: "right",
  rounds: "right",
  line: "right",
  news: "right",
  card: "none",
  business: "right",
  spotlight: "right",
  soft: "none",
  center: "none",
};

export function templateById(id: string): TemplateDef | undefined {
  const mapped = retiredTemplates[id] ?? id;
  return templates.find((item) => item.id === mapped);
}

export function parseTemplate(value: unknown): TemplateId {
  if (value === undefined || value === null || value === "") return defaultTemplate;
  if (typeof value !== "string") throw new Error("不支持的模板。");
  if (templates.some((item) => item.id === value)) return value as TemplateId;
  const retired = retiredTemplates[value];
  if (retired) return retired;
  throw new Error("不支持的模板。");
}

const retiredAvatars: Record<string, AvatarId> = {
  host: "male",
  lecturer: "male",
  advisor: "female",
  medic: "male",
};

export function parseAvatar(value: unknown): AvatarId {
  if (value === undefined || value === null || value === "") return defaultAvatar;
  if (typeof value !== "string") throw new Error("不支持的数字人。");
  if (avatars.some((item) => item.id === value)) return value as AvatarId;
  const retired = retiredAvatars[value];
  if (retired) return retired;
  throw new Error("不支持的数字人。");
}

export function parseAvatarCorner(value: unknown): AvatarCorner {
  if (value === undefined || value === null || value === "") return defaultAvatarCorner;
  if (typeof value === "string" && avatarCorners.some((item) => item.id === value)) {
    return value as AvatarCorner;
  }
  throw new Error("不支持的数字人布局。");
}

export function defaultAvatarScaleFor(template: TemplateId): number {
  return template === "none" ? defaultAvatarScaleNone : defaultAvatarScaleTemplate;
}

export function parseAvatarScale(value: unknown, template: TemplateId = defaultTemplate): number {
  if (value === undefined || value === null || value === "") return defaultAvatarScaleFor(template);
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw new Error("数字人比例无效。");
  return Math.min(1.5, Math.max(0.3, Math.round(number * 100) / 100));
}

export function freeAvatarSlot(corner: AvatarCorner): FrameRect {
  const w = 460;
  const h = 1080;
  if (corner === "left") return { x: 0, y: 0, w, h };
  if (corner === "center") return { x: Math.round((1920 - w) / 2), y: 0, w, h };
  return { x: 1920 - w, y: 0, w, h };
}

export function portraitSlot(
  template: TemplateDef,
  avatar: AvatarId,
  corner: AvatarCorner = defaultAvatarCorner,
): FrameRect | null {
  if (avatar === "none") return null;
  if (template.id === "none") return freeAvatarSlot(corner);
  return template.avatar;
}
