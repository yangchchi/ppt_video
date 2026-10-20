# Linux / Docker 部署设计

## 目标

幻演 MotionDeck 在 Linux 服务器与 Docker 中完整成片，功能与现网一致：PPT 画面、旁白、字幕、模板、数字人闭嘴/讲话口型、转场。不再依赖 macOS、PowerPoint、Swift、AppKit、Vision。

本机 macOS 开发也走同一条路径：`npm run dev` 调用本机 LibreOffice / Poppler / ffmpeg，不调 PowerPoint。

## 架构

```
.pptx → LibreOffice headless → PDF
     → pdftoppm → slides/slide-NNN.png
     → Edge TTS → audio
     → @napi-rs/canvas 字幕（含高亮框）
     → assets 预切数字人 PNG + talk.ts 口型
     → ffmpeg → output.mp4
```

删除 `native/*.swift` 与运行时 `swiftc` 编译。

## 组件替换

| 原 | 新 |
| --- | --- |
| AppleScript + PowerPoint → PDF | `soffice --headless --convert-to pdf`（路径可用 `SOFFICE_PATH`） |
| `pdf-to-png.swift` | `pdftoppm -png -scale-to-x 1920`，再规范为 `slide-001.png` |
| `burn-subtitle.swift` | TypeScript + `@napi-rs/canvas` + 仓库内 Noto Sans SC |
| `draw-avatar.swift` | 仓库提交 `assets/avatars/{male,female}{,-talk}.png` |
| `talk-avatar.swift` | 已废弃；`talk.ts` 用 ffmpeg concat |

## Docker

单阶段或双阶段镜像基于 Debian/Ubuntu：

- Node 20+
- `libreoffice-impress`（或 `libreoffice-writer` 全量）、`poppler-utils`、`ffmpeg`
- 中文字体（系统包或复制 `assets/fonts`）
- `EXPOSE` 与现 `PORT`（默认 3780）
- 挂载 `data/` 持久化任务

提供 `Dockerfile` 与简短 `docker compose` 示例。文档写明本机 brew / apt 依赖，便于非 Docker 开发。

## 错误与队列

- 找不到 `soffice` / `pdftoppm` / `ffmpeg`：中文错误，提示安装或看 Docker 文档。
- LibreOffice 失败：保留 stderr 尾部（现有 command 逻辑）。
- 单任务队列不变；LibreOffice 仍串行。

## 测试

- 现有单元测试保持（不启 LibreOffice）。
- 新增字幕 wrap / burn 的纯函数或小图测试。
- 手工：Docker 内上传样例 pptx 成片。

## 明确不做

- 不保留 PowerPoint 双轨。
- 不在运行时 rembg / Vision 抠图。
- 不保证 LibreOffice 版式与 PowerPoint 逐像素一致。
