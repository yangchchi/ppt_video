# 技术规格：PPT 转视频

## 1. 运行环境

- Node.js 20+，TypeScript，ESM。
- Linux 或 macOS。画面导出依赖 LibreOffice（`soffice`）把演示文稿转成 PDF，再用 `pdftoppm`（poppler-utils）渲成 PNG。
- `@napi-rs/canvas` + `assets/fonts/NotoSansSC-Regular.otf`（或 `SUBTITLE_FONT` / 系统 Noto CJK）绘制字幕与高亮框。
- 本机 `ffmpeg` 与 `ffprobe` 在 `PATH` 中，用于静音、音频拼接、画幅、垫底音乐、数字人口型和视频合成。
- 语音使用 npm 包 `@andresaya/edge-tts` 调用 Edge 在线朗读，不需要 API Key。输出格式为 `audio-24khz-96kbitrate-mono-mp3`。

不调用外部大模型。LibreOffice 对复杂版式的还原可能与 Microsoft PowerPoint 有差别，以服务器可部署为优先。

推荐部署：项目根目录 `Dockerfile` / `docker-compose.yml`（镜像内含 LibreOffice Impress、poppler-utils、ffmpeg、fonts-noto-cjk）。

本机开发依赖示例：

- macOS：`brew install libreoffice poppler ffmpeg`
- Debian/Ubuntu：`apt install libreoffice-impress poppler-utils ffmpeg fonts-noto-cjk`

## 2. 进程与目录

单个 Node 进程同时提供网页和转换流水线。

```
.docs/func_spec.md
.docs/tech_spec.md
package.json
Dockerfile
docker-compose.yml
tsconfig.json
src/index.ts                 启动 HTTP
src/server.ts                路由与静态页面
src/jobs.ts                  配置稿、任务状态与单线程队列
src/config.ts                环境变量
src/options.ts               成片选项与语速合成
src/catalog.ts               公共模板与数字人目录
src/pipeline/extractNotes.ts 从 pptx 读取备注和页面文字
src/pipeline/script.ts       由页面文字或备注得到旁白
src/pipeline/renderSlides.ts LibreOffice → PDF → pdftoppm PNG
src/pipeline/synthesize.ts   脚本 → mp3
src/pipeline/subtitles.ts    canvas 字幕
src/pipeline/talk.ts         数字人口型
src/pipeline/compose.ts      PNG + mp3 → mp4
src/pipeline/runJob.ts       串联渲染步骤
assets/avatars/              预切透明数字人 PNG
assets/fonts/                字幕字体
public/                      首页与历史页
test/
data/jobs/<id>/              运行时产物，不提交
data/previews/               试听缓存，不提交
```

`data/` 在进程启动时创建。任务目录：

```
input.pptx
job.json
slides.pdf
lo-profile/                 LibreOffice 用户配置（任务内隔离）
slides/slide-001.png
audio/slide-001.mp3
segments/slide-001.mp4
bed.m4a                     仅打开背景音乐时
output.mp4
```

## 3. 任务状态

`draft`：已上传并读出文字，等待用户确认。不进入渲染队列。

`queued` 与 `running`：正在等待或占用渲染。全局 `Promise` 链保证同一时刻只有一个任务占用 LibreOffice。

`done` 与 `failed`：渲染结束。失败时删除 `output.mp4`。

服务重启时，`queued` 和 `running` 改为 `failed`，原因是「服务重启，这次转换已中断。」`draft` 保持可配置。已有 `output.mp4` 的任务视为 `done`。

## 4. 流水线

`createDraft` 只解包 pptx。`startJob` 写入选项后把任务排进队列。`runJob` 按顺序执行，任一步抛错则任务变为 `failed`。

1. **校验**  
   确认 zip 内存在 `ppt/presentation.xml`。页数必须与配置稿一致，且在 1 到 80 之间。旁白使用配置稿里已经确定的 `script`，不用渲染阶段重新从备注覆盖用户改过的文本。
2. **导出画面**  
   `soffice --headless --convert-to pdf`（可用 `SOFFICE_PATH` 指定可执行文件）。导出前按字体栈探测本机可用字体：`Noto Sans SC` → `PingFang SC` → `Microsoft YaHei`（类似 CSS `font-family`）。优先使用仓库内 `assets/fonts/NotoSansSC-Regular.otf`；写好 `fonts.conf`（整条 prefer 链）与 LibreOffice `registrymodifications.xcu`（把常见中英文字体替换为栈中第一个可用字体），并设置 `FONTCONFIG_FILE`、`SAL_USE_VCLPLUGIN=gen`，避免缺字变成方框。用户配置目录落在任务目录的 `lo-profile/`，避免并发锁。输出重命名为 `slides.pdf`。再用 `pdftoppm -png -scale-to-x 1920` 写出页面，并规范为 `slide-001.png` 起。PDF 页数必须等于幻灯片页数，否则失败。
3. **语音**  
   有脚本：`EdgeTTS.generate`，音色、`rate`、`pitch` 来自上传选项。超过 500 字按 `。！？!?` 和换行切开，逐段合成，再用 ffmpeg 重新编码接成一页音频。  
   无脚本：`anullsrc` 生成该时长档位对应的静音 MP3。
4. **拼接**  
   每一页先按字幕行烧出画面副本，再按画幅滤镜编码成段：

   - 未选模板时：`plain` 为 `scale` 后白边补到 1920×1080；`stage` 为一份放大裁切并 `boxblur`、另一份缩小后居中；`push` 为放大到 2304×1296 后用 `zoompan` 推到 1.05 倍。
   - 选了模板时：`color` 铺模板背景，幻灯片缩进 `slide` 矩形，数字人按 `avatar` 矩形固定 `overlay`，不再上下浮动。表演视频按该页旁白生成，字幕分段时用 `trim` 对齐口型。
   - 未选模板但选了数字人时，成片完成转场后，再按整段成片音轨把表演贴到右下角。

数字人素材在 `assets/avatars/`：`male.png` / `male-talk.png`、`female.png` / `female-talk.png`（已抠透明通道）。成片按旁白音量在闭嘴图与讲话图之间切换，用 ffmpeg concat 拼成宽 480 的 VP9。可选 `male`、`female`。旧的 `host`、`lecturer`、`medic` 读成男性，`advisor` 读成女性。

   视频 `-c:v libx264 -tune stillimage`，音频 AAC 160 kbps、44100 Hz、双声道，30 fps。直接切换或只有一页时，用 concat demuxer 以 `-c copy` 连接。其他转场用 `xfade` 和 `acrossfade`，转场 0.5 秒；短于 0.12 秒则该处改为 concat。

   打开背景音乐时，用三路正弦波做成垫底，循环后以 `amix=normalize=0` 混入成片。

字幕按行烧进画面副本。用 `@napi-rs/canvas` 与仓库字体折行并绘制；样式 `bar` 为黑底白字，`board` 为白底黑字。打开重点高亮时按形状相对位置描圆角框。缩略图接口仍返回未加字幕的原图。

## 5. 文字提取与脚本

使用 `fflate` 解包，`fast-xml-parser` 解析 XML。

页序来自 `ppt/presentation.xml` 的 `p:sldIdLst` / `p:sldId`，再经 `ppt/_rels/presentation.xml.rels` 找到 `ppt/slides/slideN.xml`。

每页的 `ppt/slides/_rels/slideN.xml.rels` 里，关系类型以 `/notesSlide` 结尾的项指向备注部件。没有该关系则备注为空字符串。

备注正文：在备注部件中查找 `p:ph` 且 `type="body"` 的形状，收集其 `p:txBody` 文字。段落对应 `a:p`，段内 `a:r` / `a:t` 直接相连，`a:br` 视为换行。没有 body 占位符时，收集备注部件里的全部文字。结果去掉首尾空白；空结果视为无备注。

页面文字：跳过 `p:ph` 类型为 `sldNum`、`dt`、`ftr`、`hdr`、`sldImg` 的形状。`title` 与 `ctrTitle` 合成标题。`body`、`subTitle`、`obj` 以及没有占位符的形状作为要点。没有标题占位符时，第一个内容段落当作标题，其余当作要点。

`buildNarration` 是纯函数。`notes` 返回备注。`silent` 返回空字符串。`slides` 把标题和要点补上句号；`index === 0` 时在前面加上演讲者和受众，`index === count - 1` 时在后面加上学习目标。静态导入在 `startJob` 时调用它。逐页脚本保存用户提交的字符串。

语速：正式 -8，平稳 0，生动 +10，再加简短 +12、自动 0、充分 -10，钳制到 [-40, 40]，格式为 `+10%` 这种字符串。音高分别为 `-2Hz`、`+0Hz`、`+2Hz`。

## 6. HTTP

| 方法 | 路径 | 行为 |
| --- | --- | --- |
| GET | `/api/options` | 转场、音色、语言、语调、时长、画幅、模板、数字人、脚本来源、导入方式及默认值 |
| GET | `/api/avatars/:id` | 数字人 PNG。`id` 为 `male`、`female` |
| GET | `/api/jobs/active` | `{ busy }`。存在 `queued` 或 `running` 时为 true |
| GET | `/api/jobs` | 已完成且有视频的任务，新的在前 |
| POST | `/api/jobs` | `multipart/form-data` 字段名 `file`。成功 `201`，正文为配置稿 |
| DELETE | `/api/jobs/:id` | 仅删除 `draft` |
| POST | `/api/jobs/:id/scripts` | JSON：脚本来源和三项补充说明。返回 `{ scripts }`，不修改任务 |
| POST | `/api/jobs/:id/start` | JSON：全部成片选项。`editable` 时必须带 `scripts`。成功后状态为 `queued` |
| POST | `/api/voices/preview` | JSON：`voice`、`tone`、`pace`。返回 `audio/mpeg`，相同参数复用 `data/previews` |
| GET | `/api/jobs/:id` | 任务状态。`draft` 返回完整脚本；其他状态脚本和备注最长 120 字 |
| GET | `/api/jobs/:id/video` | `output.mp4`，支持 Range |
| GET | `/api/jobs/:id/slides/:index` | 1 起始的 PNG 画面 |

`:id` 必须是 UUID。非法 id 返回 404。

上传限制见 `MAX_UPLOAD_MB`，默认 50。非 `.pptx` 返回 400。已有渲染任务时开始生成返回 409。

## 7. 配置

| 变量 | 默认 | 含义 |
| --- | --- | --- |
| `PORT` | `3780` | HTTP 端口 |
| `TTS_VOICE` | `zh-CN-XiaoxiaoNeural` | Edge 音色 |
| `EMPTY_SLIDE_SECONDS` | `3` | 自动档位的空脚本停留秒数 |
| `MAX_UPLOAD_MB` | `50` | 上传上限 |
| `MAX_SLIDES` | `80` | 页数上限 |
| `SOFFICE_PATH` | （自动探测） | LibreOffice 可执行文件 |
| `SUBTITLE_FONT` | `assets/fonts/NotoSansSC-Regular.otf` 等 | 字幕字体文件 |

## 8. 错误处理

流水线错误带中文 `message`，写入任务的 `error`，`status=failed`。LibreOffice、pdftoppm、ffmpeg、语音的 stderr 追加在消息末尾，最多 500 字。

配置稿创建失败时删除任务目录，HTTP 400，正文 `{ error }`。

## 9. 测试

单元测试不启动 LibreOffice，也不访问语音服务。

- `test/extractNotes.test.ts`：备注页序、占位符，以及标题和要点。
- `test/script.test.ts`：三种脚本来源和补充说明出现的页。
- `test/options.test.ts`：默认值、未知选项，以及语速钳制。
- `test/subtitles.test.ts`：字幕折行。

手工验收按功能规格第 10 节。Docker：`docker compose up --build`。

## 10. 启动

```
npm install
npm test
npm run dev
```

浏览器打开 `http://127.0.0.1:3780`。

```
docker compose up --build
```
