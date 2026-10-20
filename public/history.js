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

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { hour12: false });
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
  const options = optionsResponse.ok ? await optionsResponse.json() : { effects: [], voices: [] };
  const effectLabel = new Map((options.effects || []).map((item) => [item.id, item.label]));
  const voiceLabel = new Map((options.voices || []).map((item) => [item.id, item.label]));
  const layoutLabel = new Map((options.layouts || []).map((item) => [item.id, item.label]));
  if (!jobs.length) {
    empty.hidden = false;
    return;
  }
  list.innerHTML = jobs.map((job) => `
    <li>
      <a href="/history?id=${encodeURIComponent(job.id)}" data-id="${escapeHtml(job.id)}">
        <strong>${escapeHtml(job.filename)}</strong>
        <span>${escapeHtml(formatTime(job.createdAt))} · ${job.slideCount} 页 · ${escapeHtml(layoutLabel.get(job.layout) || "")} · ${escapeHtml(effectLabel.get(job.effect) || "")} · ${escapeHtml(voiceLabel.get(job.voice) || "")}${job.music && job.music !== "none" && job.music !== false ? " · 背景音乐" : ""}${job.highlight === false ? "" : " · 重点高亮"}</span>
      </a>
    </li>
  `).join("");

  const selected = new URLSearchParams(location.search).get("id");
  const current = jobs.find((job) => job.id === selected) || null;
  if (selected && !current) {
    error.hidden = false;
    error.textContent = "这条视频不存在。";
    return;
  }
  if (current) showVideo(current);
}

load();
