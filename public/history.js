function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

const list = document.querySelector("#list");
const empty = document.querySelector("#empty");
const error = document.querySelector("#error");
const player = document.querySelector("#player");
const viewerTitle = document.querySelector("#viewer-title");
const download = document.querySelector("#download");
const confirmOverlay = document.querySelector("#confirm");
const confirmMessage = document.querySelector("#confirm-message");
const confirmCancel = document.querySelector("#confirm-cancel");
const confirmOk = document.querySelector("#confirm-ok");

let jobsCache = [];
let optionsCache = { effects: [], voices: [], layouts: [] };
let pendingDelete = null;

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function clearViewer() {
  player.pause();
  player.removeAttribute("src");
  player.load();
  player.hidden = true;
  viewerTitle.hidden = true;
  viewerTitle.textContent = "";
  download.hidden = true;
  download.removeAttribute("href");
  download.removeAttribute("download");
}

function showVideo(job) {
  player.hidden = false;
  player.src = `/api/jobs/${job.id}/video`;
  player.play().catch(() => {});
  viewerTitle.hidden = false;
  viewerTitle.textContent = job.filename;
  download.hidden = false;
  download.href = `/api/jobs/${job.id}/video`;
  download.download = job.filename.replace(/\.pptx$/i, "") + ".mp4";
  for (const link of list.querySelectorAll("a")) {
    if (link.dataset.id === job.id) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  }
}

function closeConfirm() {
  pendingDelete = null;
  confirmOverlay.hidden = true;
  confirmOk.disabled = false;
}

function openConfirm(job) {
  pendingDelete = job;
  confirmMessage.textContent = `确定删除「${job.filename}」？删除后无法恢复。`;
  confirmOverlay.hidden = false;
  confirmCancel.focus();
}

function renderList(jobs, options) {
  const effectLabel = new Map((options.effects || []).map((item) => [item.id, item.label]));
  const voiceLabel = new Map((options.voices || []).map((item) => [item.id, item.label]));
  const layoutLabel = new Map((options.layouts || []).map((item) => [item.id, item.label]));
  empty.hidden = jobs.length > 0;
  list.innerHTML = jobs.map((job) => `
    <li>
      <div class="history-row">
        <a href="/history?id=${encodeURIComponent(job.id)}" data-id="${escapeHtml(job.id)}">
          <strong>${escapeHtml(job.filename)}</strong>
          <span>${escapeHtml(formatTime(job.createdAt))} · ${job.slideCount} 页 · ${escapeHtml(layoutLabel.get(job.layout) || "")} · ${escapeHtml(effectLabel.get(job.effect) || "")} · ${escapeHtml(voiceLabel.get(job.voice) || "")}${job.music && job.music !== "none" && job.music !== false ? " · 背景音乐" : ""}${job.highlight === false ? "" : " · 重点高亮"}</span>
        </a>
        <button type="button" class="history-delete" data-delete="${escapeHtml(job.id)}" aria-label="删除 ${escapeHtml(job.filename)}">删除</button>
      </div>
    </li>
  `).join("");
}

async function removeJob(job) {
  confirmOk.disabled = true;
  error.hidden = true;
  const response = await fetch(`/api/jobs/${encodeURIComponent(job.id)}`, { method: "DELETE" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    error.hidden = false;
    error.textContent = body.error || "删除失败。";
    confirmOk.disabled = false;
    return;
  }
  closeConfirm();
  jobsCache = jobsCache.filter((item) => item.id !== job.id);
  const playing = !player.hidden && player.src.includes(`/api/jobs/${job.id}/`);
  if (playing) clearViewer();
  const params = new URLSearchParams(location.search);
  if (params.get("id") === job.id) {
    history.replaceState(null, "", "/history");
  }
  renderList(jobsCache, optionsCache);
  if (!jobsCache.length) {
    clearViewer();
    return;
  }
  const currentId = new URLSearchParams(location.search).get("id");
  if (currentId) {
    const current = jobsCache.find((item) => item.id === currentId);
    if (current) showVideo(current);
  }
}

async function load() {
  const [jobsResponse, optionsResponse] = await Promise.all([
    fetch("/api/jobs"),
    fetch("/api/options"),
  ]);
  if (!jobsResponse.ok) {
    error.hidden = false;
    error.textContent = "历史记录加载失败。";
    return;
  }
  const { jobs } = await jobsResponse.json();
  optionsCache = optionsResponse.ok ? await optionsResponse.json() : { effects: [], voices: [], layouts: [] };
  jobsCache = jobs;
  renderList(jobs, optionsCache);

  const selected = new URLSearchParams(location.search).get("id");
  const current = jobs.find((job) => job.id === selected) || null;
  if (selected && !current) {
    error.hidden = false;
    error.textContent = "这条视频不存在。";
    return;
  }
  if (current) showVideo(current);
}

list.addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete]");
  if (!button) return;
  event.preventDefault();
  const job = jobsCache.find((item) => item.id === button.dataset.delete);
  if (job) openConfirm(job);
});

confirmCancel.addEventListener("click", closeConfirm);
confirmOverlay.addEventListener("click", (event) => {
  if (event.target === confirmOverlay) closeConfirm();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !confirmOverlay.hidden) closeConfirm();
});
confirmOk.addEventListener("click", () => {
  if (pendingDelete) removeJob(pendingDelete);
});

load();
