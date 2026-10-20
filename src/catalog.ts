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
    id: "business",
    label: "现代商务",
    category: "经典",
    recommended: true,
    background: "1A2744",
    slide: { x: 64, y: 100, w: 1120, h: 880 },
    avatar: { x: 1400, y: 0, w: 520, h: 1080 },
    defaultAvatar: "female",
  },
  {
    id: "spotlight",
    label: "醒目播报",
    category: "经典",
    recommended: true,
    background: "0E1A2B",
    slide: { x: 48, y: 48, w: 1400, h: 984 },
    avatar: { x: 1500, y: 0, w: 420, h: 1080 },
    defaultAvatar: "male",
  },
  {
    id: "soft",
    label: "暖色衬底",
    category: "经典",
    recommended: true,
    background: "F3EFE6",
    slide: { x: 140, y: 70, w: 1640, h: 940 },
    avatar: null,
    defaultAvatar: "none",
  },
];

export type AvatarId = (typeof avatars)[number]["id"];
export type TemplateId = (typeof templates)[number]["id"];

export const defaultTemplate: TemplateId = "none";
export const defaultAvatar: AvatarId = "none";

const retiredTemplates: Record<string, TemplateId> = {
  lecture: "business",
  briefing: "business",
  release: "spotlight",
  market: "spotlight",
  rounds: "business",
  line: "business",
  news: "spotlight",
  card: "soft",
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

export function portraitSlot(template: TemplateDef, avatar: AvatarId): FrameRect | null {
  if (avatar === "none") return null;
  if (template.id === "none") return { x: 1460, y: 0, w: 460, h: 1080 };
  return template.avatar;
}
