function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

const form = document.querySelector("#upload-form");
const fileInput = document.querySelector("#file");
const fileLabel = document.querySelector("#file-label");
const drop = document.querySelector("#drop");
const idleActions = document.querySelector("#idle-actions");
const setup = document.querySelector("#setup");
const submit = document.querySelector("#submit");
const formError = document.querySelector("#form-error");
const jobSection = document.querySelector("#job");
const statusText = document.querySelector("#status-text");
const progressPanel = document.querySelector("#progress-panel");
const progressPercent = document.querySelector("#progress-percent");
const progressClock = document.querySelector("#progress-clock");
const progressBar = document.querySelector("#progress-bar");
const progressTip = document.querySelector("#progress-tip");
const jobError = document.querySelector("#job-error");
const player = document.querySelector("#player");
const download = document.querySelector("#download");
const notes = document.querySelector("#notes");
const notesTitle = document.querySelector("#notes-title");
const steps = [...document.querySelectorAll("#steps li")];
const previewButton = document.querySelector("#preview-voice");
const previewAudio = document.querySelector("#preview-audio");
const scriptEditor = document.querySelector("#script-editor");
const scripts = document.querySelector("#scripts");
const contextFields = document.querySelector("#context-fields");

const stepOrder = ["validate", "render", "speech", "compose"];
const stepLabel = {
  queued: "排队中，等待导出空闲。页数较多时前面的任务结束得稍慢一些。",
  validate: "正在核对页数和脚本。",
  render: "正在导出幻灯片画面。复杂版式会多花一点时间，属正常现象。",
  speech: "正在按语调和时长合成旁白。",
  compose: "正在按画幅和转场拼成视频。",
  done: "视频已生成，可以预览和下载。",
  failed: "转换失败。",
};
const waitTips = [
  "页数越多，配音和拼接越久；进度条会随每一页推进。",
  "导出画面时整份文稿会一次性转换，看起来停顿一下是正常的。",
  "可以先浏览下方已就绪的页面脚本，不用干等。",
  "成片后可直接在线预览，再决定是否下载。",
  "背景音乐和数字人会在拼接阶段一起处理。",
];

function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function estimateSeconds(job) {
  const pages = Math.max(1, Number(job.slideCount) || 1);
  // 粗估：导出约 8s + 每页配音 4s + 每页拼接 5s
  return 12 + pages * 9;
}

function statusMessage(job) {
  if (job.status === "failed") return stepLabel.failed;
  if (job.progress?.detail) return job.progress.detail;
  return stepLabel[job.step] || stepLabel[job.status] || "正在处理。";
}

let catalog = null;
let draft = null;
let locale = "zh-CN";
let scriptsDirty = false;
let templateId = "none";
let avatarId = "none";
let avatarCorner = "right";
let avatarScale = 0.4;
let templateTab = "public";
let templateCategory = "全部";
let selectedMine = "";
const mineKey = "ppt-video-my-templates";
const draftKey = "ppt-video-draft-id";
const draftFormKey = "ppt-video-draft-form";
const scaleNoneDefault = 0.4;
const scaleTemplateDefault = 1;

function rememberDraft(id) {
  if (!id) {
    sessionStorage.removeItem(draftKey);
    sessionStorage.removeItem(draftFormKey);
    return;
  }
  sessionStorage.setItem(draftKey, id);
}

function saveDraftForm() {
  if (!draft) return;
  sessionStorage.setItem(draftFormKey, JSON.stringify({
    ...payload(),
    locale,
    templateTab,
    selectedMine,
  }));
}

function applyDraftForm(state) {
  if (!state || typeof state !== "object") return;
  const setRadio = (name, value) => {
    if (value === undefined || value === null || value === "") return;
    const input = form.querySelector(`input[name="${name}"][value="${CSS.escape(String(value))}"]`);
    if (input) input.checked = true;
  };
  if (state.locale) {
    locale = state.locale;
    setRadio("language", state.locale);
    renderVoices(state.voice || catalog.defaults.voice);
  }
  setRadio("scriptSource", state.scriptSource);
  setRadio("importMode", state.importMode);
  setRadio("tone", state.tone);
  setRadio("pace", state.pace);
  setRadio("layout", state.layout);
  setRadio("effect", state.effect);
  setRadio("music", state.music);
  setRadio("captionStyle", state.captionStyle);
  setRadio("highlight", state.highlight === false ? "off" : "on");
  if (state.voice) setRadio("voice", state.voice);
  if (typeof state.audience === "string") document.querySelector("#audience").value = state.audience;
  if (typeof state.speaker === "string") document.querySelector("#speaker").value = state.speaker;
  if (typeof state.goals === "string") document.querySelector("#goals").value = state.goals;
  if (state.template && catalog.templates.some((item) => item.id === state.template)) {
    templateId = state.template;
  }
  if (state.avatar && catalog.avatars.some((item) => item.id === state.avatar)) {
    avatarId = state.avatar;
  }
  if (state.avatarCorner === "left" || state.avatarCorner === "center" || state.avatarCorner === "right") {
    avatarCorner = state.avatarCorner;
  }
  if (Number.isFinite(Number(state.avatarScale))) {
    avatarScale = clampScale(Number(state.avatarScale));
  }
  if (state.templateTab === "mine" || state.templateTab === "public") templateTab = state.templateTab;
  if (typeof state.selectedMine === "string") selectedMine = state.selectedMine;
  renderMarket();
  renderAvatars();
  syncAvatarControls();
  if (Array.isArray(state.scripts) && state.scripts.length) {
    renderScripts(state.scripts);
    scriptsDirty = true;
  }
  syncOptionVisibility();
}

function clampScale(value) {
  return Math.min(1.5, Math.max(0.3, Math.round(value * 100) / 100));
}

function defaultScaleForTemplate(id) {
  return id === "none" ? scaleNoneDefault : scaleTemplateDefault;
}

function effectiveCorner() {
  if (templateId === "left") return "left";
  if (templateId === "right") return "right";
  return avatarCorner;
}

async function restoreDraft() {
  const id = sessionStorage.getItem(draftKey);
  if (!id) return;
  const response = await fetch(`/api/jobs/${encodeURIComponent(id)}`);
  if (!response.ok) {
    rememberDraft(null);
    return;
  }
  const job = await response.json();
  if (job.status === "draft") {
    let formState = null;
    try {
      formState = JSON.parse(sessionStorage.getItem(draftFormKey) || "null");
    } catch {
      formState = null;
    }
    showDraft(job);
    applyDraftForm(formState);
    saveDraftForm();
    return;
  }
  if (job.status === "queued" || job.status === "running" || job.status === "done" || job.status === "failed") {
    rememberDraft(null);
    setup.hidden = true;
    drop.hidden = true;
    idleActions.hidden = true;
    watch(job.id);
    return;
  }
  rememberDraft(null);
}

function choiceGroup(container, name, items, selected, labelFor) {
  if (!container) return;
  container.innerHTML = (items || []).map((item) => `
    <label class="choice">
      <input type="radio" name="${name}" value="${escapeHtml(item.id)}" ${item.id === selected ? "checked" : ""}>
      <span>${escapeHtml(labelFor(item))}</span>
    </label>
  `).join("");
}

function selectedValue(name) {
  return form.querySelector(`input[name="${name}"]:checked`)?.value;
}

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function showError(message) {
  formError.hidden = !message;
  formError.textContent = message || "";
}

async function loadOptions() {
  const response = await fetch("/api/options");
  catalog = await response.json();
  choiceGroup(document.querySelector("#script-sources"), "scriptSource", catalog.scriptSources, catalog.defaults.scriptSource, (item) => item.label);
  choiceGroup(
    document.querySelector("#highlights"),
    "highlight",
    [{ id: "on", label: "开启" }, { id: "off", label: "关闭" }],
    catalog.defaults.highlight === false ? "off" : "on",
    (item) => item.label,
  );
  choiceGroup(document.querySelector("#languages"), "language", catalog.languages, "zh-CN", (item) => item.label);
  choiceGroup(document.querySelector("#tones"), "tone", catalog.tones, catalog.defaults.tone, (item) => item.label);
  renderVoices(catalog.defaults.voice);
  choiceGroup(
    document.querySelector("#music-options"),
    "music",
    catalog.musicTracks || [
      { id: "none", label: "无音乐" },
      { id: "hometown", label: "故乡的原风景" },
      { id: "breeze", label: "清风漫步" },
    ],
    catalog.defaults.music || "none",
    (item) => item.label,
  );
  choiceGroup(document.querySelector("#import-modes"), "importMode", catalog.importModes, catalog.defaults.importMode, (item) => item.label);
  choiceGroup(
    document.querySelector("#caption-styles"),
    "captionStyle",
    catalog.captionStyles || [
      { id: "bar", label: "黑底白字" },
      { id: "board", label: "白底黑字" },
      { id: "off", label: "无字幕" },
    ],
    catalog.defaults.captionStyle || "bar",
    (item) => item.label,
  );
  choiceGroup(document.querySelector("#paces"), "pace", catalog.paces, catalog.defaults.pace, (item) => item.label);
  choiceGroup(document.querySelector("#layouts"), "layout", catalog.layouts, catalog.defaults.layout, (item) => item.label);
  choiceGroup(document.querySelector("#effects"), "effect", catalog.effects, catalog.defaults.effect, (item) => item.label);
  templateId = catalog.defaults.template || "none";
  avatarId = catalog.defaults.avatar || "none";
  avatarCorner = catalog.defaults.avatarCorner || "right";
  avatarScale = clampScale(Number(catalog.defaults.avatarScale ?? scaleNoneDefault));
  renderMarket();
  renderAvatars();
  renderAvatarCorners();
  syncAvatarControls();
  syncOptionVisibility();
}

function loadMine() {
  try {
    const parsed = JSON.parse(localStorage.getItem(mineKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMineList(items) {
  localStorage.setItem(mineKey, JSON.stringify(items));
}

function percent(value, total) {
  return `${(value / total) * 100}%`;
}

function stageHtml(template) {
  if (!template.slide) {
    return `<span class="stage"><span class="sheet" style="left:8%;top:8%;width:84%;height:84%"></span></span>`;
  }
  const person = template.avatar
    ? `<span class="person" style="left:${percent(template.avatar.x, 1920)};top:${percent(template.avatar.y, 1080)};width:${percent(template.avatar.w, 1920)};height:${percent(template.avatar.h, 1080)}"></span>`
    : "";
  return `<span class="stage" style="background:#${template.background}">
    <span class="sheet" style="left:${percent(template.slide.x, 1920)};top:${percent(template.slide.y, 1080)};width:${percent(template.slide.w, 1920)};height:${percent(template.slide.h, 1080)}"></span>
    ${person}
  </span>`;
}

function renderMarket() {
  document.querySelector("#tab-public").setAttribute("aria-pressed", String(templateTab === "public"));
  document.querySelector("#tab-mine").setAttribute("aria-pressed", String(templateTab === "mine"));
  const categories = document.querySelector("#template-categories");
  const grid = document.querySelector("#template-grid");
  if (templateTab === "mine") {
    categories.hidden = true;
    const mine = loadMine();
    grid.innerHTML = mine.length ? mine.map((item) => {
      const template = catalog.templates.find((entry) => entry.id === item.templateId) || catalog.templates[0];
      return `<button type="button" class="template-card" data-mine="${escapeHtml(item.id)}" aria-pressed="${item.id === selectedMine ? "true" : "false"}">
        ${stageHtml(template)}
        <strong>${escapeHtml(item.name)}</strong>
        <span class="mine-meta"><span>${escapeHtml(template.label)}</span><span data-remove="${escapeHtml(item.id)}">删除</span></span>
      </button>`;
    }).join("") : `<p class="hint">还没有保存的组合。</p>`;
    return;
  }
  categories.hidden = true;
  categories.innerHTML = "";
  grid.innerHTML = catalog.templates.map((item) => `
    <button type="button" class="template-card" data-template="${escapeHtml(item.id)}" aria-pressed="${item.id === templateId ? "true" : "false"}">
      ${stageHtml(item)}
      <strong>${escapeHtml(item.label)}</strong>
    </button>
  `).join("");
}

function knownAvatar(id) {
  if (catalog.avatars.some((item) => item.id === id)) return id;
  if (id === "advisor") return "female";
  if (id === "host" || id === "lecturer" || id === "medic") return "male";
  return "none";
}

function renderAvatars() {
  document.querySelector("#avatars").innerHTML = catalog.avatars.map((item) => `
    <button type="button" class="avatar-card" data-avatar="${escapeHtml(item.id)}" aria-pressed="${item.id === avatarId ? "true" : "false"}">
      ${item.id === "none"
        ? `<span class="empty-portrait">无</span>`
        : `<img alt="${escapeHtml(item.label)}" src="/api/avatars/${escapeHtml(item.id)}">`}
      <strong>${escapeHtml(item.label)}</strong>
    </button>
  `).join("");
}

function renderAvatarCorners() {
  const corners = catalog.avatarCorners || [
    { id: "left", label: "左" },
    { id: "center", label: "中" },
    { id: "right", label: "右" },
  ];
  const corner = effectiveCorner();
  document.querySelector("#avatar-corners").innerHTML = corners.map((item) => `
    <label class="choice">
      <input type="radio" name="avatarCorner" value="${escapeHtml(item.id)}" ${item.id === corner ? "checked" : ""}>
      <span>${escapeHtml(item.label)}</span>
    </label>
  `).join("");
}

function syncAvatarControls() {
  const hasAvatar = avatarId !== "none";
  const controls = document.querySelector("#avatar-controls");
  const preview = document.querySelector("#avatar-preview");
  const corners = document.querySelector("#avatar-corners");
  const scaleInput = document.querySelector("#avatar-scale");
  const scaleValue = document.querySelector("#avatar-scale-value");
  const freeLayout = templateId === "none";
  const layoutEnabled = hasAvatar && freeLayout;
  controls.dataset.disabled = hasAvatar ? "false" : "true";
  preview.dataset.empty = hasAvatar ? "false" : "true";
  corners.dataset.locked = layoutEnabled ? "false" : "true";
  [...corners.querySelectorAll("input")].forEach((input) => {
    input.disabled = !layoutEnabled;
    input.checked = input.value === effectiveCorner();
  });
  scaleInput.disabled = !hasAvatar;
  const percent = Math.round(avatarScale * 100);
  scaleInput.value = String(percent);
  scaleValue.textContent = `${percent}%`;
  updateAvatarPreview();
}

function updateAvatarPreview() {
  const person = document.querySelector("#avatar-preview-person");
  if (!person) return;
  const hasAvatar = avatarId !== "none";
  person.hidden = !hasAvatar;
  if (!hasAvatar) return;
  const corner = effectiveCorner();
  const width = 18 + (avatarScale - 0.3) / 1.2 * 28;
  person.style.width = `${width}%`;
  if (corner === "left") {
    person.style.left = "4%";
    person.style.right = "auto";
    person.style.transform = "none";
  } else if (corner === "center") {
    person.style.left = "50%";
    person.style.right = "auto";
    person.style.transform = "translateX(-50%)";
  } else {
    person.style.left = "auto";
    person.style.right = "4%";
    person.style.transform = "none";
  }
}

function renderVoices(selected) {
  const items = catalog.voices.filter((item) => item.locale === locale);
  const current = items.some((item) => item.id === selected) ? selected : items[0]?.id;
  choiceGroup(document.querySelector("#voices"), "voice", items, current, (item) => `${item.label} · ${item.hint}`);
}

function syncOptionVisibility() {
  const editable = selectedValue("importMode") === "editable";
  const fromSlides = selectedValue("scriptSource") === "slides";
  scriptEditor.hidden = !editable;
  contextFields.hidden = !fromSlides;
  document.querySelector("#layout-field").hidden = templateId !== "none";
  syncAvatarControls();
}

function payload() {
  const body = {
    effect: selectedValue("effect") || "",
    voice: selectedValue("voice") || "",
    tone: selectedValue("tone") || "",
    pace: selectedValue("pace") || "",
    layout: selectedValue("layout") || "",
    template: templateId,
    avatar: avatarId,
    avatarCorner: effectiveCorner(),
    avatarScale,
    music: selectedValue("music") || "none",
    highlight: selectedValue("highlight") !== "off",
    captionStyle: selectedValue("captionStyle") || "bar",
    scriptSource: selectedValue("scriptSource") || "",
    importMode: selectedValue("importMode") || "",
    audience: document.querySelector("#audience").value,
    speaker: document.querySelector("#speaker").value,
    goals: document.querySelector("#goals").value,
  };
  if (body.importMode === "editable") {
    body.scripts = [...scripts.querySelectorAll("textarea")].map((item) => item.value);
  }
  return body;
}

function renderScripts(lines) {
  scripts.innerHTML = lines.map((line, index) => `
    <label class="script-line">
      <span>第 ${index + 1} 页</span>
      <textarea rows="3">${escapeHtml(line)}</textarea>
    </label>
  `).join("");
  scriptsDirty = false;
}

async function rewriteScripts() {
  if (!draft) return;
  const response = await fetch(`/api/jobs/${draft.id}/scripts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload()),
  });
  const body = await response.json();
  if (!response.ok) {
    showError(body.error || "无法重写脚本。");
    return;
  }
  renderScripts(body.scripts);
}

function showDraft(job) {
  draft = job;
  rememberDraft(job.id);
  drop.hidden = true;
  idleActions.hidden = true;
  setup.hidden = false;
  document.querySelector("#file-name").textContent = job.filename;
  document.querySelector("#file-meta").textContent = `${job.slideCount} 页 · ${formatBytes(job.bytes)}`;
  const highlightInput = form.querySelector(`input[name="highlight"][value="${job.highlight === false ? "off" : "on"}"]`);
  if (highlightInput) highlightInput.checked = true;
  const musicId = job.music === true ? "hometown" : (job.music === false || !job.music ? "none" : job.music);
  const musicInput = form.querySelector(`input[name="music"][value="${musicId}"]`);
  if (musicInput) musicInput.checked = true;
  const captionId = job.captionStyle === "classic" || job.captionStyle === "minimal" ? "bar" : (job.captionStyle || "bar");
  const captionInput = form.querySelector(`input[name="captionStyle"][value="${captionId}"]`);
  if (captionInput) captionInput.checked = true;
  renderScripts(job.slides.map((slide) => slide.script));
  syncOptionVisibility();
  saveDraftForm();
}

async function refreshBusy() {
  const response = await fetch("/api/jobs/active");
  const body = await response.json();
  submit.disabled = body.busy || !draft;
  fileInput.disabled = body.busy;
}

fileInput.addEventListener("change", () => {
  if (fileInput.files?.[0]) uploadFile(fileInput.files[0]);
});

drop.addEventListener("dragover", (event) => {
  event.preventDefault();
  drop.classList.add("dragover");
});

drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));

drop.addEventListener("drop", (event) => {
  event.preventDefault();
  drop.classList.remove("dragover");
  const file = event.dataTransfer?.files?.[0];
  if (file) uploadFile(file);
});

form.addEventListener("change", (event) => {
  if (event.target.name === "templateCategory") {
    templateCategory = event.target.value;
    renderMarket();
  }
  if (event.target.name === "language") {
    locale = event.target.value;
    renderVoices(selectedValue("voice"));
  }
  if (event.target.name === "importMode" && event.target.value === "editable" && !scriptsDirty) {
    rewriteScripts();
  }
  syncOptionVisibility();
  saveDraftForm();
});

form.addEventListener("input", () => {
  saveDraftForm();
});

scripts.addEventListener("input", () => {
  scriptsDirty = true;
});

document.querySelector("#rewrite").addEventListener("click", () => {
  rewriteScripts();
});

document.querySelector("#tab-public").addEventListener("click", () => {
  templateTab = "public";
  renderMarket();
});

document.querySelector("#tab-mine").addEventListener("click", () => {
  templateTab = "mine";
  renderMarket();
});

document.querySelector("#template-grid").addEventListener("click", (event) => {
  const remove = event.target.closest("[data-remove]");
  if (remove) {
    saveMineList(loadMine().filter((item) => item.id !== remove.dataset.remove));
    if (selectedMine === remove.dataset.remove) selectedMine = "";
    renderMarket();
    return;
  }
  const mineCard = event.target.closest("[data-mine]");
  if (mineCard) {
    const item = loadMine().find((entry) => entry.id === mineCard.dataset.mine);
    if (!item) return;
    templateId = item.templateId;
    avatarId = knownAvatar(item.avatarId);
    if (item.avatarCorner === "left" || item.avatarCorner === "center" || item.avatarCorner === "right") {
      avatarCorner = item.avatarCorner;
    }
    if (Number.isFinite(Number(item.avatarScale))) avatarScale = clampScale(Number(item.avatarScale));
    else avatarScale = defaultScaleForTemplate(templateId);
    selectedMine = item.id;
    renderMarket();
    renderAvatars();
    renderAvatarCorners();
    syncOptionVisibility();
    saveDraftForm();
    return;
  }
  const card = event.target.closest("[data-template]");
  if (!card) return;
  templateId = card.dataset.template;
  selectedMine = "";
  const template = catalog.templates.find((item) => item.id === templateId);
  if (template) avatarId = template.defaultAvatar;
  avatarScale = defaultScaleForTemplate(templateId);
  if (templateId === "left") avatarCorner = "left";
  if (templateId === "right") avatarCorner = "right";
  renderMarket();
  renderAvatars();
  renderAvatarCorners();
  syncOptionVisibility();
  saveDraftForm();
});

document.querySelector("#avatars").addEventListener("click", (event) => {
  const card = event.target.closest("[data-avatar]");
  if (!card) return;
  avatarId = card.dataset.avatar;
  selectedMine = "";
  renderAvatars();
  renderMarket();
  syncAvatarControls();
  saveDraftForm();
});

document.querySelector("#avatar-corners").addEventListener("change", (event) => {
  if (event.target.name !== "avatarCorner" || templateId !== "none") return;
  avatarCorner = event.target.value;
  syncAvatarControls();
  saveDraftForm();
});

document.querySelector("#avatar-scale").addEventListener("input", (event) => {
  avatarScale = clampScale(Number(event.target.value) / 100);
  syncAvatarControls();
  saveDraftForm();
});

document.querySelector("#save-template").addEventListener("click", () => {
  const template = catalog.templates.find((item) => item.id === templateId);
  const avatar = catalog.avatars.find((item) => item.id === avatarId);
  if (!template) return;
  const name = `${template.label} · ${avatar?.label || "无数字人"}`;
  const items = loadMine().filter((item) => item.name !== name);
  const saved = {
    id: `${Date.now()}`,
    name,
    templateId,
    avatarId,
    avatarCorner: effectiveCorner(),
    avatarScale,
  };
  items.unshift(saved);
  saveMineList(items.slice(0, 24));
  selectedMine = saved.id;
  templateTab = "mine";
  renderMarket();
});

document.querySelector("#remove-file").addEventListener("click", async () => {
  if (!draft) return;
  await fetch(`/api/jobs/${draft.id}`, { method: "DELETE" });
  draft = null;
  rememberDraft(null);
  setup.hidden = true;
  drop.hidden = false;
  idleActions.hidden = false;
  fileInput.value = "";
  fileLabel.textContent = "选择或拖入 .pptx，最大 50 MB，最多 80 页";
  showError("");
  refreshBusy();
});

previewButton.addEventListener("click", async () => {
  showError("");
  previewButton.disabled = true;
  const response = await fetch("/api/voices/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload()),
  });
  previewButton.disabled = false;
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    showError(body.error || "试听失败。");
    return;
  }
  const blob = await response.blob();
  previewAudio.src = URL.createObjectURL(blob);
  previewAudio.hidden = false;
  previewAudio.play().catch(() => {});
});

async function uploadFile(file) {
  showError("");
  if (!file.name.toLowerCase().endsWith(".pptx")) {
    showError("只支持 .pptx 文件。");
    return;
  }
  fileLabel.textContent = "正在读取页面文字…";
  const data = new FormData();
  data.set("file", file);
  const response = await fetch("/api/jobs", { method: "POST", body: data });
  const body = await response.json();
  fileLabel.textContent = "选择或拖入 .pptx，最大 50 MB，最多 80 页";
  if (!response.ok) {
    showError(body.error || "上传失败。");
    return;
  }
  showDraft(body);
  refreshBusy();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError("");
  if (!draft) {
    showError("请先选择一个 .pptx 文件。");
    return;
  }
  submit.disabled = true;
  const response = await fetch(`/api/jobs/${draft.id}/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload()),
  });
  const body = await response.json();
  if (!response.ok) {
    showError(body.error || "无法开始生成。");
    submit.disabled = false;
    return;
  }
  const jobId = draft.id;
  rememberDraft(null);
  watch(jobId);
});

function renderSteps(job) {
  const current = stepOrder.indexOf(job.step);
  for (const item of steps) {
    const index = stepOrder.indexOf(item.dataset.step);
    item.classList.toggle("active", (job.status === "running" || job.status === "queued") && index === current);
    item.classList.toggle("done", job.status === "done" || (current > index && index !== -1));
  }
}

function renderProgress(job, startedAtMs, displayPercent) {
  const waiting = job.status === "queued" || job.status === "running";
  progressPanel.hidden = !waiting && job.status !== "done";
  if (job.status === "failed") progressPanel.hidden = true;

  const serverPercent = Number(job.progress?.percent);
  let percent = Number.isFinite(serverPercent) ? serverPercent : displayPercent;
  if (job.status === "done") percent = 100;
  if (job.status === "queued") percent = Math.max(percent, 1);
  percent = Math.max(0, Math.min(100, Math.round(percent)));

  progressPercent.textContent = `${percent}%`;
  progressBar.style.width = `${percent}%`;
  const elapsed = Date.now() - startedAtMs;
  const eta = estimateSeconds(job) * 1000;
  if (waiting) {
    const remain = Math.max(0, eta - elapsed);
    progressClock.textContent = percent >= 8 && remain > 5000
      ? `已用时 ${formatElapsed(elapsed)} · 大约还要 ${formatElapsed(remain)}`
      : `已用时 ${formatElapsed(elapsed)}`;
  } else if (job.status === "done") {
    progressClock.textContent = `总用时 ${formatElapsed(elapsed)}`;
  }
  statusText.textContent = statusMessage(job);
  return percent;
}

function watch(id) {
  jobSection.hidden = false;
  player.hidden = true;
  download.hidden = true;
  jobError.hidden = true;
  progressPanel.hidden = false;
  notes.innerHTML = "";
  notesTitle.hidden = true;
  progressTip.textContent = waitTips[0];
  progressBar.style.width = "0%";
  progressPercent.textContent = "0%";

  const localStart = Date.now();
  let tipIndex = 0;
  let displayPercent = 0;
  let lastStep = null;
  let latestJob = { status: "queued", slideCount: draft?.slideCount || 1, startedAt: null, progress: null };
  let startedAtMs = localStart;

  const tipTimer = setInterval(() => {
    tipIndex = (tipIndex + 1) % waitTips.length;
    if (latestJob.status === "queued" || latestJob.status === "running") {
      progressTip.textContent = waitTips[tipIndex];
    }
  }, 8000);

  const tickTimer = setInterval(() => {
    if (latestJob.status !== "queued" && latestJob.status !== "running") return;
    if (latestJob.status === "running" && latestJob.step === "render") {
      displayPercent = Math.min(26, displayPercent + 0.35);
    }
    displayPercent = renderProgress(latestJob, startedAtMs, displayPercent);
  }, 1000);

  const timer = setInterval(async () => {
    const response = await fetch(`/api/jobs/${id}`);
    const job = await response.json();
    latestJob = job;
    startedAtMs = job.startedAt ? Date.parse(job.startedAt) || localStart : localStart;

    if (job.step !== lastStep) {
      lastStep = job.step;
      if (job.step === "render") displayPercent = Math.max(displayPercent, 12);
      if (job.step === "speech") displayPercent = Math.max(displayPercent, 28);
      if (job.step === "compose") displayPercent = Math.max(displayPercent, 70);
    }

    renderSteps(job);
    displayPercent = renderProgress(job, startedAtMs, displayPercent);

    const slidesReady = job.status === "done" || job.step === "speech" || job.step === "compose";
    if (slidesReady && job.slides?.length && notes.childElementCount === 0) {
      notesTitle.hidden = false;
      notesTitle.textContent = "页面脚本";
      notes.innerHTML = job.slides.map((slide) => `
        <li>
          <img alt="第 ${slide.index} 页" src="/api/jobs/${id}/slides/${slide.index}">
          <span>${slide.empty ? "这一页没有旁白。" : escapeHtml(slide.script)}</span>
        </li>
      `).join("");
    }
    if (job.status === "done") {
      clearInterval(timer);
      clearInterval(tipTimer);
      clearInterval(tickTimer);
      renderProgress(job, startedAtMs, 100);
      progressTip.textContent = "可以预览成片，或下载 MP4 分享。";
      player.hidden = false;
      player.src = `/api/jobs/${id}/video`;
      download.hidden = false;
      download.href = `/api/jobs/${id}/video`;
      download.download = "ppt-video.mp4";
      submit.disabled = false;
      loadRecentReel();
    }
    if (job.status === "failed") {
      clearInterval(timer);
      clearInterval(tipTimer);
      clearInterval(tickTimer);
      progressPanel.hidden = true;
      jobError.hidden = false;
      jobError.textContent = job.error || "转换失败。";
      submit.disabled = false;
    }
  }, 1000);
}

async function loadRecentReel() {
  const track = document.querySelector("#recent-reel");
  if (!track) return;
  const response = await fetch("/api/jobs");
  if (!response.ok) {
    track.classList.remove("is-scrolling");
    track.innerHTML = `<p class="recent-reel-empty">暂时无法加载历史成片。</p>`;
    return;
  }
  const body = await response.json();
  const jobs = Array.isArray(body.jobs) ? body.jobs.slice(0, 9) : [];
  const cards = jobs.map((job) => {
    const title = String(job.filename || "未命名").replace(/\.pptx$/i, "");
    return `<a class="recent-card" href="/history?id=${encodeURIComponent(job.id)}">
      <span class="thumb">
        <img alt="" src="/api/jobs/${encodeURIComponent(job.id)}/slides/1" loading="lazy">
        <span class="play" aria-hidden="true"><span></span></span>
      </span>
      <strong title="${escapeHtml(title)}">${escapeHtml(title)}</strong>
    </a>`;
  });
  while (cards.length < 9) {
    cards.push(`<div class="recent-card is-empty" aria-hidden="true">
      <span class="thumb"></span>
      <strong>${jobs.length ? "" : "暂无成片"}</strong>
    </div>`);
  }
  cards.push(`<a class="recent-more" href="/history">
    <span class="thumb"><span class="more-mark" aria-hidden="true"><span>···</span></span></span>
    <strong>更多</strong>
  </a>`);
  const sequence = cards.join("");
  track.innerHTML = sequence + sequence;
  track.classList.add("is-scrolling");
}

loadOptions()
  .then(restoreDraft)
  .then(refreshBusy)
  .then(loadRecentReel);
