# 幻演 · MotionDeck

把 `.pptx` 转成带旁白、字幕和数字人的讲解视频。可在 Linux / macOS 本机或 Docker 中运行，不依赖 Microsoft PowerPoint 或 macOS 专有框架。

## 依赖

- Node.js 20+
- LibreOffice（`soffice`）
- poppler-utils（`pdftoppm`）
- ffmpeg / ffprobe

macOS：

```bash
brew install libreoffice poppler ffmpeg
```

Debian / Ubuntu：

```bash
sudo apt install libreoffice-impress poppler-utils ffmpeg fonts-noto-cjk
```

## 本机启动

```bash
npm install
npm test
npm run dev
```

打开 <http://127.0.0.1:3780>。

可选环境变量：`PORT`、`SOFFICE_PATH`、`SUBTITLE_FONT`、`TTS_VOICE`、`MAX_UPLOAD_MB`、`MAX_SLIDES`。

## Docker

```bash
docker compose up --build
```

国内服务器 apt 过慢时，换镜像源再构建：

```bash
docker compose build --build-arg APT_MIRROR=mirrors.aliyun.com
docker compose up -d
```

服务监听 `3780`，任务数据写在挂载的 `./data`。

> 首次构建会装 LibreOffice 等大包，可能需 10–30 分钟；日志里持续出现 `Get:N` 说明仍在下载，并非卡死。

## 说明

画面由 LibreOffice 导出为 PDF 再渲成 PNG，复杂版式可能与本机 PowerPoint 不完全一致。数字人使用 `assets/avatars/` 中预切的透明 PNG；字幕字体默认 `assets/fonts/NotoSansSC-Regular.otf`。
