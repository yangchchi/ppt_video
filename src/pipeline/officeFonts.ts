import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { rootDir } from "../config.js";

/** PPT 里常见、本机又常缺失的中文字体，统一替换为解析出的主字体。 */
export const officeFontAliases = [
  "Microsoft YaHei",
  "Microsoft YaHei Light",
  "Microsoft YaHei UI",
  "微软雅黑",
  "微软雅黑 Light",
  "SimSun",
  "SimHei",
  "SimKai",
  "KaiTi",
  "FangSong",
  "NSimSun",
  "DengXian",
  "等线",
  "宋体",
  "黑体",
  "楷体",
  "仿宋",
  "Microsoft JhengHei",
  "Microsoft JhengHei Light",
  "PingFang SC",
  "苹方-简",
  "Source Han Sans SC",
  "Source Han Sans CN",
  "Noto Sans CJK SC",
  "Arial",
  "Calibri",
];

/** 类似 CSS：Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif */
export const officeFontStack = [
  "Noto Sans SC",
  "PingFang SC",
  "Microsoft YaHei",
] as const;

export type OfficeFontFamily = (typeof officeFontStack)[number];

export interface ResolvedOfficeFont {
  family: string;
  prefer: string[];
  filePath: string | null;
}

/** @deprecated 保留给旧测试；运行时请用 resolveOfficeFont().family */
export const officeReplaceFont = "Noto Sans SC";

export function bundledCjkFontPath(): string {
  return path.join(rootDir, "assets", "fonts", "NotoSansSC-Regular.otf");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function preferXml(families: string[]): string {
  return families.map((family) => `<family>${escapeXml(family)}</family>`).join("");
}

/** 按操作系统微调探测路径；栈顺序始终是 Noto → PingFang → YaHei。 */
export function candidateFontFiles(platform = process.platform): Array<{ family: OfficeFontFamily; paths: string[] }> {
  const home = os.homedir();
  const bundled = bundledCjkFontPath();
  const macPingFang = [
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/Supplemental/PingFang.ttc",
  ];
  const macYaHei = [
    path.join(home, "Library", "Fonts", "msyh.ttc"),
    path.join(home, "Library", "Fonts", "msyh.ttf"),
    path.join(home, "Library", "Fonts", "微软雅黑.ttf"),
    "/Library/Fonts/Microsoft/msyh.ttc",
    "/Library/Fonts/msyh.ttf",
  ];
  const linuxNoto = [
    bundled,
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
  ];
  const linuxYaHei = [
    "/usr/share/fonts/truetype/msttcorefonts/msyh.ttf",
    "/usr/share/fonts/truetype/microsoft/msyh.ttf",
    path.join(home, ".fonts", "msyh.ttf"),
    path.join(home, ".local", "share", "fonts", "msyh.ttf"),
  ];
  const winYaHei = [
    "C:\\Windows\\Fonts\\msyh.ttc",
    "C:\\Windows\\Fonts\\msyh.ttf",
  ];
  const winPingFang: string[] = [];

  if (platform === "darwin") {
    return [
      { family: "Noto Sans SC", paths: [bundled] },
      { family: "PingFang SC", paths: macPingFang },
      { family: "Microsoft YaHei", paths: macYaHei },
    ];
  }
  if (platform === "win32") {
    return [
      { family: "Noto Sans SC", paths: [bundled] },
      { family: "PingFang SC", paths: winPingFang },
      { family: "Microsoft YaHei", paths: winYaHei },
    ];
  }
  return [
    { family: "Noto Sans SC", paths: linuxNoto },
    { family: "PingFang SC", paths: macPingFang },
    { family: "Microsoft YaHei", paths: linuxYaHei },
  ];
}

export async function resolveOfficeFont(platform = process.platform): Promise<ResolvedOfficeFont> {
  const prefer = [...officeFontStack];
  for (const candidate of candidateFontFiles(platform)) {
    for (const filePath of candidate.paths) {
      try {
        await fs.access(filePath);
        return { family: candidate.family, prefer, filePath };
      } catch {
        // try next path
      }
    }
  }
  return { family: officeFontStack[0], prefer, filePath: null };
}

export function buildFontConfigXml(fontDirs: string[], prefer: string[] = [...officeFontStack]): string {
  const primary = prefer[0] ?? officeFontStack[0];
  const dirs = fontDirs.map((dir) => `  <dir>${escapeXml(dir)}</dir>`).join("\n");
  const aliases = officeFontAliases.map((family) => `  <alias binding="strong">
    <family>${escapeXml(family)}</family>
    <prefer>${preferXml(prefer)}</prefer>
  </alias>`).join("\n");
  const defaults = `  <alias binding="strong">
    <family>sans-serif</family>
    <prefer>${preferXml(prefer)}</prefer>
  </alias>
  <alias binding="strong">
    <family>serif</family>
    <prefer>${preferXml(prefer)}</prefer>
  </alias>
  <alias binding="strong">
    <family>monospace</family>
    <prefer>${preferXml(prefer)}</prefer>
  </alias>
  <alias binding="strong">
    <family>${escapeXml(primary)}</family>
    <prefer>${preferXml(prefer)}</prefer>
  </alias>`;
  return `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
${dirs}
${aliases}
${defaults}
</fontconfig>
`;
}

export function buildRegistryModificationsXml(replaceFont: string = officeFontStack[0]): string {
  const targets = new Set([...officeFontAliases, ...officeFontStack.filter((name) => name !== replaceFont)]);
  const nodes = [...targets].map((family, index) => {
    const name = `subst${index}`;
    return `<node oor:name="${name}" oor:op="fuse"><prop oor:name="SubstFont" oor:op="fuse"><value>${escapeXml(family)}</value></prop><prop oor:name="ReplaceFont" oor:op="fuse"><value>${escapeXml(replaceFont)}</value></prop><prop oor:name="ScreenOnly" oor:op="fuse"><value>false</value></prop><prop oor:name="AlwaysExplicit" oor:op="fuse"><value>true</value></prop></node>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.Office.Common/Font/Substitution"><prop oor:name="Replacement" oor:op="fuse"><value>true</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Font/Substitution/ReplacementList">${nodes}</item>
</oor:items>
`;
}

export async function prepareOfficeFonts(workDir: string): Promise<{
  fontConfigPath: string;
  profileDir: string;
  env: NodeJS.ProcessEnv;
  font: ResolvedOfficeFont;
}> {
  const resolved = await resolveOfficeFont();
  const fontsDir = path.join(workDir, "lo-fonts");
  const profileDir = path.join(workDir, "lo-profile");
  const userDir = path.join(profileDir, "user");
  await fs.mkdir(fontsDir, { recursive: true });
  await fs.mkdir(userDir, { recursive: true });

  if (resolved.filePath) {
    const targetName = path.basename(resolved.filePath);
    await fs.copyFile(resolved.filePath, path.join(fontsDir, targetName));
  } else {
    try {
      await fs.access(bundledCjkFontPath());
      await fs.copyFile(bundledCjkFontPath(), path.join(fontsDir, path.basename(bundledCjkFontPath())));
    } catch {
      throw new Error(
        "找不到可用中文字体。请保留 assets/fonts/NotoSansSC-Regular.otf，或在系统中安装 PingFang SC / Microsoft YaHei。",
      );
    }
  }

  // 仓库字体始终放进目录，保证栈里的 Noto 在 Linux / Docker 可用
  try {
    const bundled = bundledCjkFontPath();
    await fs.access(bundled);
    await fs.copyFile(bundled, path.join(fontsDir, path.basename(bundled)));
  } catch {
    // already handled above when nothing else exists
  }

  const fontDirs = [
    fontsDir,
    "/usr/share/fonts",
    "/usr/local/share/fonts",
    "/System/Library/Fonts",
    "/System/Library/Fonts/Supplemental",
    "/Library/Fonts",
    path.join(os.homedir(), "Library", "Fonts"),
    path.join(os.homedir(), ".fonts"),
    path.join(os.homedir(), ".local", "share", "fonts"),
  ];
  if (process.platform === "win32") {
    fontDirs.push("C:\\Windows\\Fonts");
  }

  const fontConfigPath = path.join(workDir, "fonts.conf");
  await fs.writeFile(fontConfigPath, buildFontConfigXml(fontDirs, resolved.prefer));
  await fs.writeFile(path.join(userDir, "registrymodifications.xcu"), buildRegistryModificationsXml(resolved.family));

  return {
    fontConfigPath,
    profileDir,
    font: resolved,
    env: {
      FONTCONFIG_FILE: fontConfigPath,
      SAL_USE_VCLPLUGIN: "gen",
    },
  };
}
