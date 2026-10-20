import fs from "node:fs/promises";
import path from "node:path";
import { avatarSourcesDir, avatarsDir, drawAvatarBin, drawAvatarSource } from "../config.js";
import type { AvatarId } from "../catalog.js";
import { runCommand } from "./command.js";

async function ensureDrawer(): Promise<void> {
  await fs.mkdir(path.dirname(drawAvatarBin), { recursive: true });
  const [sourceStat, binStat] = await Promise.all([
    fs.stat(drawAvatarSource),
    fs.stat(drawAvatarBin).catch(() => null),
  ]);
  if (!binStat || binStat.mtimeMs < sourceStat.mtimeMs) {
    await runCommand("swiftc", ["-O", drawAvatarSource, "-o", drawAvatarBin], 120_000);
  }
}

export async function ensureAvatar(id: Exclude<AvatarId, "none">): Promise<string> {
  await ensureDrawer();
  await fs.mkdir(avatarsDir, { recursive: true });
  const restSource = path.join(avatarSourcesDir, `${id}.jpg`);
  const talkSource = path.join(avatarSourcesDir, `${id}-talk.jpg`);
  const restPath = path.join(avatarsDir, `${id}.png`);
  const talkPath = path.join(avatarsDir, `${id}-talk.png`);
  const [binStat, restStat, talkStat, restPng, talkPng] = await Promise.all([
    fs.stat(drawAvatarBin),
    fs.stat(restSource),
    fs.stat(talkSource),
    fs.stat(restPath).catch(() => null),
    fs.stat(talkPath).catch(() => null),
  ]);
  const freshAfter = Math.max(binStat.mtimeMs, restStat.mtimeMs, talkStat.mtimeMs);
  if (!restPng || !talkPng || restPng.mtimeMs < freshAfter || talkPng.mtimeMs < freshAfter) {
    await runCommand(drawAvatarBin, [restSource, talkSource, restPath, talkPath], 60_000);
  }
  return restPath;
}
