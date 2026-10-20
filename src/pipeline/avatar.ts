import fs from "node:fs/promises";
import path from "node:path";
import { avatarSourcesDir } from "../config.js";
import type { AvatarId } from "../catalog.js";

export async function ensureAvatar(id: Exclude<AvatarId, "none">): Promise<string> {
  const restPath = path.join(avatarSourcesDir, `${id}.png`);
  const talkPath = path.join(avatarSourcesDir, `${id}-talk.png`);
  try {
    await fs.access(restPath);
    await fs.access(talkPath);
  } catch {
    throw new Error(`找不到数字人素材 ${id}.png / ${id}-talk.png。`);
  }
  return restPath;
}
