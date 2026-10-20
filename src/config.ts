import path from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export const dataDir = path.join(rootDir, "data");
export const jobsDir = path.join(dataDir, "jobs");
export const publicDir = path.join(rootDir, "public");
export const avatarSourcesDir = path.join(rootDir, "assets", "avatars");

export const port = Number(process.env.PORT ?? 3780);
export const ttsVoice = process.env.TTS_VOICE ?? "zh-CN-XiaoxiaoNeural";
export const emptySlideSeconds = Number(process.env.EMPTY_SLIDE_SECONDS ?? 3);
export const maxUploadMb = Number(process.env.MAX_UPLOAD_MB ?? 50);
export const maxSlides = Number(process.env.MAX_SLIDES ?? 80);
export const slideWidth = 1920;
export const videoWidth = 1920;
export const videoHeight = 1080;
