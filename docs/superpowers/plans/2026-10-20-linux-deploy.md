# Linux Deploy Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox syntax.

**Goal:** Remove macOS/PowerPoint/Swift dependencies; run full pipeline on Linux/Docker and Mac via LibreOffice.

**Architecture:** soffice → pdftoppm → canvas subtitles → asset avatars → existing ffmpeg compose/talk.

**Tech Stack:** Node 20, LibreOffice, poppler-utils, ffmpeg, `@napi-rs/canvas`, Noto Sans SC

**Spec:** `docs/superpowers/specs/2026-10-20-linux-deploy-design.md`

## Global Constraints

- Single cross-platform pipeline; no PowerPoint branch
- Full feature parity including avatar mouth switching
- Pre-cut PNGs in `assets/avatars/`
- Chinese font in `assets/fonts/`

---

### Task 1: Assets + deps

- [x] Copy cutout PNGs from `data/avatars` into `assets/avatars/`
- [x] Add Noto Sans SC (or subset) under `assets/fonts/`
- [x] Add `@napi-rs/canvas` dependency

### Task 2: renderSlides via LibreOffice + pdftoppm

- [x] Rewrite `src/pipeline/renderSlides.ts`
- [x] Resolve `soffice` via `SOFFICE_PATH` and common paths
- [x] Update tech/func specs

### Task 3: Subtitles via canvas

- [x] Replace Swift burn with `src/pipeline/subtitles.ts` canvas impl
- [x] Preserve wrap, bar/board styles, highlight boxes
- [x] Add unit tests for wrapping

### Task 4: Avatar without Swift

- [x] `ensureAvatar` returns asset PNG paths only
- [x] Remove Swift paths from `config.ts`
- [x] Delete `native/*.swift`

### Task 5: Docker + docs

- [x] `Dockerfile` (+ optional compose)
- [x] Update `.docs/tech_spec.md` / func_spec error messages
- [x] Startup dependency check or clear ENOENT messages

### Task 6: Verify

- [x] `npm test`
- [x] Install LibreOffice/poppler locally if possible and smoke export, or document Docker-only verify
