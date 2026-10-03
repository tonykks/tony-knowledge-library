// YouTube Knowledge Agent - Channel View Application

let catalogItems = [];
let groupedChannels = [];
let activeChannelId = "";
let batchPollInterval = null;

document.addEventListener("DOMContentLoaded", () => {
  initChannelsApp();
});

async function initChannelsApp() {
  DataSource.activateLocalControls();
  if (DataSource.isLocal) setupEventListeners();
  await loadCatalog();
  if (DataSource.isLocal) startBatchPolling();
}

function setupEventListeners() {
  // Modal controls
  const addModal = document.getElementById("add-modal");
  const openModalBtn = document.getElementById("open-add-modal-btn");
  const closeModalBtn = document.getElementById("close-modal-btn");
  const cancelModalBtn = document.getElementById("cancel-modal-btn");
  const addForm = document.getElementById("add-url-form");

  if (openModalBtn) {
    openModalBtn.addEventListener("click", () => {
      addModal.classList.add("active");
      document.getElementById("url-textarea").focus();
    });
  }

  const closeModal = () => addModal && addModal.classList.remove("active");
  if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
  if (cancelModalBtn) cancelModalBtn.addEventListener("click", closeModal);

  if (addModal) {
    addModal.addEventListener("click", (e) => {
      if (e.target === addModal) closeModal();
    });
  }

  // Add form submission
  if (addForm) {
    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const textarea = document.getElementById("url-textarea");
      const urlsText = textarea.value.trim();
      if (!urlsText) return;

      const submitBtn = document.getElementById("submit-url-btn");
      submitBtn.disabled = true;
      submitBtn.textContent = "등록 중...";

      try {
        const resp = await fetch("./api/batch/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: urlsText }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || "등록 실패");

        textarea.value = "";
        closeModal();
        startBatchPolling();
      } catch (err) {
        alert("영상 등록 실패: " + err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "지식 추출 시작";
      }
    });
  }

  // Resume batch button
  const resumeBtn = document.getElementById("resume-batch-btn");
  if (resumeBtn) {
    resumeBtn.addEventListener("click", async () => {
      try {
        await fetch("./api/batch/resume", { method: "POST" });
        startBatchPolling();
      } catch (err) {
        console.error(err);
      }
    });
  }
}

async function loadCatalog() {
  try {
    const data = await DataSource.catalog();
    catalogItems = (data.items || []).filter((item) => !item.is_hidden);

    const countEl = document.getElementById("total-video-count");
    if (countEl) countEl.textContent = catalogItems.length;

    processChannelsData();
    renderChannelTabs();

    // Default select first channel or from URL query
    const urlParams = new URLSearchParams(window.location.search);
    const queryChannelId = urlParams.get("id");
    if (queryChannelId && groupedChannels.some((c) => c.id === queryChannelId)) {
      selectChannel(queryChannelId);
    } else if (groupedChannels.length > 0) {
      selectChannel(groupedChannels[0].id);
    } else {
      renderEmptyState();
    }
  } catch (err) {
    console.error("Failed to load catalog:", err);
  }
}

function processChannelsData() {
  // Group by channel_id (fallback to channel name)
  const channelMap = new Map();

  // Stable identity and deterministic heading, independent of edit/save order.
  [...catalogItems].sort((a, b) => a.video_id.localeCompare(b.video_id)).forEach((it) => {
    const cid = it.channel_id || it.channel || "default_channel";
    if (!channelMap.has(cid)) {
      let displayName = it.channel || "알 수 없음";
      channelMap.set(cid, {
        id: cid,
        name: displayName,
        items: [],
      });
    }
    channelMap.get(cid).items.push(it);
  });

  // Sort channels in Korean alphabetical order (가나다순)
  groupedChannels = Array.from(channelMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "ko")
  );
}

function renderChannelTabs() {
  const container = document.getElementById("channel-tabs-bar");
  if (!container) return;

  if (groupedChannels.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = groupedChannels
    .map(
      (c) => `
    <button class="channel-tab-pill ${c.id === activeChannelId ? "active" : ""}" data-channel-id="${escapeHtml(c.id)}">
      <span>📺 ${escapeHtml(c.name)}</span>
      <span class="channel-count-badge">${c.items.length}편</span>
    </button>
  `
    )
    .join("");

  // Attach click events
  container.querySelectorAll(".channel-tab-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectChannel(btn.dataset.channelId);
    });
  });
}

function selectChannel(channelId) {
  activeChannelId = channelId;

  // Update tab highlights
  document.querySelectorAll(".channel-tab-pill").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.channelId === activeChannelId);
  });

  const targetChannel = groupedChannels.find((c) => c.id === activeChannelId);
  if (!targetChannel) {
    renderEmptyState();
    return;
  }

  renderChannelContent(targetChannel);
}

function renderChannelContent(channel) {
  const container = document.getElementById("channel-content-area");
  const emptyState = document.getElementById("empty-state");
  if (!container || !emptyState) return;

  if (!channel.items || channel.items.length === 0) {
    container.innerHTML = "";
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none";

  // 1. Group videos by Speaker inside channel
  const speakerMap = new Map();
  channel.items.forEach((it) => {
    const spk = normalizeSpeakerName(it.speakers);
    if (!speakerMap.has(spk)) speakerMap.set(spk, []);
    speakerMap.get(spk).push(it);
  });

  // 2. Sort Speakers in Korean alphabetical order (가나다순, with "채널 자체 콘텐츠" at end)
  const sortedSpeakers = Array.from(speakerMap.keys()).sort((a, b) => {
    if (a === "채널 자체 콘텐츠") return 1;
    if (b === "채널 자체 콘텐츠") return -1;
    return a.localeCompare(b, "ko");
  });

  // 3. Build HTML for each Speaker
  const html = sortedSpeakers
    .map((spk) => {
      const spkItems = speakerMap.get(spk);

      // Separate into Series vs General videos
      const seriesMap = new Map();
      const generalItems = [];

      spkItems.forEach((it) => {
        const parsed = parseSeriesAndEpisode(it.title);
        // If series identified
        if (parsed.series && (it.title.includes("성리학개론") || parsed.series.includes("성리학") || (parsed.episode !== null && parsed.episode < 100))) {
          const sname = parsed.series;
          if (!seriesMap.has(sname)) seriesMap.set(sname, []);
          seriesMap.get(sname).push({ item: it, episode: parsed.episode });
        } else {
          generalItems.push(it);
        }
      });

      // Render Series sections
      let seriesHTML = "";
      seriesMap.forEach((sitems, sname) => {
        // Sort: 1화..N화 오름차순, None (몰아보기/특집) at end
        sitems.sort((a, b) => {
          if (a.episode === null && b.episode === null) return 0;
          if (a.episode === null) return 1;
          if (b.episode === null) return -1;
          return a.episode - b.episode;
        });

        seriesHTML += `
          <div class="series-group-section">
            <div class="series-group-title">
              <span>📚</span>
              <strong>${escapeHtml(sname)}</strong>
              <span style="font-size: 0.85rem; color: #94a3b8; font-weight: 500;">(${sitems.length}편 순차 강연)</span>
            </div>
            <div class="video-grid">
              ${sitems.map((si) => createCardHTML(si.item, si.episode)).join("")}
            </div>
          </div>
        `;
      });

      // Render General (non-serialized) videos sorted newest first
      let generalHTML = "";
      if (generalItems.length > 0) {
        generalItems.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
        generalHTML = `
          <div class="series-group-section" style="background: transparent; border: none; padding: 0;">
            ${seriesMap.size > 0 ? '<div class="series-group-title" style="color: #cbd5e1;"><span>🎬</span> 일반 영상</div>' : ""}
            <div class="video-grid">
              ${generalItems.map((it) => createCardHTML(it, null)).join("")}
            </div>
          </div>
        `;
      }

      return `
        <section class="speaker-group-section" style="margin-bottom: 2.5rem;">
          <div class="speaker-group-header">
            <span>🎙️</span>
            <span>강연자: <strong>${escapeHtml(spk)}</strong></span>
            <span class="stat-badge" style="font-size: 0.78rem;">${spkItems.length}편</span>
          </div>
          ${seriesHTML}
          ${generalHTML}
        </section>
      `;
    })
    .join("");

  container.innerHTML = `
    <div style="background: rgba(15, 23, 42, 0.4); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 2rem;">
      <div style="display: flex; align-items: center; justify-content: space-between; padding-bottom: 1.25rem; border-bottom: 1px solid var(--border-subtle); margin-bottom: 2rem;">
        <h3 style="font-size: 1.4rem; font-weight: 700; color: #ffffff; display: flex; align-items: center; gap: 0.6rem;">
          <span>📺</span>
          <span>${escapeHtml(channel.name)}</span>
        </h3>
        <span class="stat-badge" style="font-size: 0.85rem;">총 ${channel.items.length}편 보관</span>
      </div>
      ${html}
    </div>
  `;
}

function renderEmptyState() {
  const container = document.getElementById("channel-content-area");
  const emptyState = document.getElementById("empty-state");
  if (container) container.innerHTML = "";
  if (emptyState) emptyState.style.display = "block";
}

function createCardHTML(item, forcedEpisode) {
  const vid = item.video_id;
  const thumbnail = `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
  const duration = item.duration_str || "00:00";
  const kdcText = `[${item.kdc_main_code}] ${item.kdc_main_name} > ${item.kdc_sub_name}`;

  // Speaker badge
  let speakerBadge = "";
  const speakerName = normalizeSpeakerName(item.speakers);
  if (speakerName && speakerName !== "채널 자체 콘텐츠") {
    speakerBadge = `<span class="speaker-tag" title="핵심 강연자">🎙️ ${escapeHtml(speakerName)}</span>`;
  }

  // Episode badge
  let episodeBadge = "";
  if (typeof forcedEpisode === "number") {
    episodeBadge = `<span class="episode-badge">${forcedEpisode}화</span> `;
  } else {
    const parsed = parseSeriesAndEpisode(item.title);
    if (parsed.episode !== null && parsed.episode < 100) {
      episodeBadge = `<span class="episode-badge">${parsed.episode}화</span> `;
    }
  }

  const tagsHTML = (item.tags || [])
    .slice(0, 4)
    .map((t) => `<span class="card-tag">#${escapeHtml(t)}</span>`)
    .join("");

  return `
    <a href="./viewer.html?id=${vid}" class="video-card">
      <div class="card-thumbnail-wrapper">
        <img src="${thumbnail}" alt="${escapeHtml(item.title)}" loading="lazy" />
        <div class="card-kdc-badge">${escapeHtml(kdcText)}</div>
        <div class="card-duration-badge">${escapeHtml(duration)}</div>
      </div>
      <div class="card-body">
        <h3 class="card-title">${episodeBadge}${escapeHtml(item.title)}</h3>
        <div class="card-meta-row">
          <span class="card-channel" title="${escapeHtml(item.channel)}">${escapeHtml(item.channel)}</span>
          ${speakerBadge}
        </div>
        <div class="card-tags">
          ${tagsHTML}
        </div>
      </div>
    </a>
  `;
}

function startBatchPolling() {
  if (!DataSource.isLocal) return;
  if (batchPollInterval) clearInterval(batchPollInterval);
  checkBatchStatus();
  batchPollInterval = setInterval(checkBatchStatus, 3000);
}

async function checkBatchStatus() {
  try {
    const resp = await fetch("./api/batch/status");
    const data = await resp.json();
    const items = data.items || [];

    const processing = items.filter((it) => it.status === "processing");
    const pending = items.filter((it) => it.status === "pending");
    const failed = items.filter((it) => it.status === "failed");

    const banner = document.getElementById("batch-banner");
    const bannerText = document.getElementById("batch-banner-text");
    const bannerDetail = document.getElementById("batch-banner-detail");
    const resumeBtn = document.getElementById("resume-batch-btn");

    if (!banner) return;

    if (processing.length > 0 || pending.length > 0) {
      banner.classList.add("visible");
      const current = processing[0] || pending[0];
      bannerText.textContent = `배치 작업 진행 중: ${current.title || current.video_id || "영상 처리 중"}...`;
      bannerDetail.textContent = `(대기: ${pending.length}건, 완료/전체: ${items.filter((i) => i.status === "completed").length}/${items.length})`;
      if (resumeBtn) resumeBtn.style.display = "none";
    } else {
      if (failed.length > 0) {
        banner.classList.add("visible");
        bannerText.textContent = `배치 작업 완료 (${failed.length}건 실패)`;
        bannerDetail.textContent = failed[0].error_message ? `사유: ${failed[0].error_message}` : "";
        if (resumeBtn) resumeBtn.style.display = "inline-flex";
      } else {
        banner.classList.remove("visible");
      }
    }
  } catch (err) {
    console.error("Batch polling error:", err);
  }
}

function escapeHtml(text) {
  if (!text) return "";
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
