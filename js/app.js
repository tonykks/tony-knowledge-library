// YouTube Knowledge Agent - Main Dashboard Application

let catalogItems = [];
let activeCategoryCode = "";
let activeCategoryName = "";
let searchQuery = "";
let visibleLimit = 9;
let batchPollInterval = null;
let lastFailedItems = [];
let hiddenSearchGeneration = 0;

async function refreshPublicSync() {
  try { document.getElementById("public-sync-status").textContent = (await DataSource.syncStatus()).message; }
  catch { document.getElementById("public-sync-status").textContent = "공개 반영 상태를 확인할 수 없습니다."; }
}

function setupHiddenManagement() {
  const dialog = document.getElementById("hidden-modal");
  document.getElementById("open-hidden-btn").addEventListener("click", () => {
    document.getElementById("hidden-search-input").value = "";
    dialog.showModal(); loadHiddenVideos();
  });
  document.getElementById("close-hidden-btn").addEventListener("click", () => dialog.close());
  document.getElementById("hidden-search-form").addEventListener("submit", (event) => {
    event.preventDefault(); loadHiddenVideos();
  });
}

async function loadHiddenVideos() {
  const generation = ++hiddenSearchGeneration;
  const message = document.getElementById("hidden-message");
  message.textContent = "불러오는 중...";
  try {
    const query = document.getElementById("hidden-search-input").value;
    const data = await DataSource.catalog("hidden", query);
    if (generation !== hiddenSearchGeneration) return;
    const box = document.getElementById("hidden-items-list"); box.replaceChildren();
    message.textContent = data.items.length ? `${data.items.length}편` : "조건에 맞는 숨긴 영상이 없습니다.";
    for (const item of data.items) {
      const row = document.createElement("div"); row.className = "hidden-video-row";
      const link = document.createElement("a"); link.textContent = item.title;
      link.href = `./viewer.html?id=${encodeURIComponent(item.video_id)}`;
      const button = document.createElement("button"); button.className = "btn-secondary"; button.textContent = "복원";
      button.setAttribute("aria-label", `${item.title} 복원`);
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          const current = await DataSource.video(item.video_id);
          await DataSource.mutate(item.video_id, "restore", { expected_revision: current.revision });
          await loadHiddenVideos(); await loadCatalog(); refreshPublicSync();
        } catch (error) { message.textContent = error.message; button.disabled = false; }
      });
      row.append(link, button); box.append(row);
    }
  } catch (error) { if (generation === hiddenSearchGeneration) message.textContent = error.message; }
}

document.addEventListener("DOMContentLoaded", () => {
  initApp();
});

async function initApp() {
  DataSource.activateLocalControls();
  setupEventListeners();
  await loadCatalog();
  if (DataSource.isLocal) {
    setupHiddenManagement();
    startBatchPolling();
    refreshPublicSync();
    setInterval(refreshPublicSync, 4000);
  }
}

function getGridColumnCount() {
  const container = document.getElementById("video-grid");
  if (!container) return 3;
  const computed = window.getComputedStyle(container);
  const cols = computed.getPropertyValue("grid-template-columns");
  if (cols && cols !== "none") {
    const count = cols.split(/\s+/).filter(Boolean).length;
    if (count > 0) return count;
  }
  const width = container.clientWidth || window.innerWidth;
  if (width >= 1050) return 3;
  if (width >= 680) return 2;
  return 1;
}

function get3RowCount() {
  return getGridColumnCount() * 3;
}

function setupEventListeners() {
  if (DataSource.isLocal) {
  // Modal controls for Adding URL
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

  // Failure Management Modal controls
  const failureModal = document.getElementById("failure-modal");
  const manageFailuresBtn = document.getElementById("manage-failures-btn");
  const closeFailureModalBtn = document.getElementById("close-failure-modal-btn");
  const closeFailureModalBtn2 = document.getElementById("close-failure-modal-btn2");

  const openFailureModal = () => {
    if (failureModal) {
      renderFailureModal(lastFailedItems);
      failureModal.classList.add("active");
    }
  };

  const closeFailureModal = () => {
    if (failureModal) failureModal.classList.remove("active");
  };

  if (manageFailuresBtn) manageFailuresBtn.addEventListener("click", openFailureModal);
  if (closeFailureModalBtn) closeFailureModalBtn.addEventListener("click", closeFailureModal);
  if (closeFailureModalBtn2) closeFailureModalBtn2.addEventListener("click", closeFailureModal);

  if (failureModal) {
    failureModal.addEventListener("click", (e) => {
      if (e.target === failureModal) closeFailureModal();
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

  }
  // Search input & button (NO keystroke filtering; only button click or Enter key)
  const searchInput = document.getElementById("search-input");
  const searchBtn = document.getElementById("search-btn");

  const executeSearch = () => {
    searchQuery = (searchInput.value || "").trim();
    visibleLimit = get3RowCount();
    renderGrid();
  };

  if (searchBtn) {
    searchBtn.addEventListener("click", executeSearch);
  }

  if (searchInput) {
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        executeSearch();
      }
    });
  }

  // Category chips
  const categoryChips = document.querySelectorAll(".category-chip");
  categoryChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      categoryChips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      activeCategoryCode = chip.dataset.code || "";
      activeCategoryName = activeCategoryCode ? chip.textContent.trim() : "";
      visibleLimit = get3RowCount();
      renderGrid();
    });
  });

  // Reset filter button
  const resetBtn = document.getElementById("reset-filter-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      resetFiltersAndHome();
    });
  }

  // All contents nav menu resets to default 3 rows
  const navAllBtn = document.getElementById("nav-all-btn");
  if (navAllBtn) {
    navAllBtn.addEventListener("click", (e) => {
      // If already on homepage, prevent full reload and just reset view
      if (window.location.pathname === "/" || window.location.pathname === "/index.html") {
        e.preventDefault();
        resetFiltersAndHome();
      }
    });
  }

  // Load More button for search / category results
  const loadMoreBtn = document.getElementById("load-more-btn");
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => {
      visibleLimit += get3RowCount();
      renderGrid();
    });
  }

  // General batch resume button (excludes restricted)
  const resumeBtn = document.getElementById("resume-batch-btn");
  if (resumeBtn && DataSource.isLocal) {
    resumeBtn.addEventListener("click", async () => {
      try {
        await fetch("./api/batch/resume", { method: "POST" });
        startBatchPolling();
      } catch (err) {
        console.error(err);
      }
    });
  }

  // Responsive window resize
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      renderGrid();
    }, 150);
  });
}

function resetFiltersAndHome() {
  searchQuery = "";
  activeCategoryCode = "";
  activeCategoryName = "";
  const searchInput = document.getElementById("search-input");
  if (searchInput) searchInput.value = "";

  const categoryChips = document.querySelectorAll(".category-chip");
  categoryChips.forEach((c) => c.classList.remove("active"));
  const allCatBtn = document.querySelector('.category-chip[data-code=""]');
  if (allCatBtn) allCatBtn.classList.add("active");

  visibleLimit = get3RowCount();
  renderGrid();
}

async function loadCatalog() {
  try {
    const data = await DataSource.catalog();
    catalogItems = (data.items || []).filter((item) => !item.is_hidden);

    const countEl = document.getElementById("total-video-count");
    if (countEl) countEl.textContent = catalogItems.length;

    visibleLimit = get3RowCount();
    renderGrid();
  } catch (err) {
    console.error("Failed to load catalog:", err);
  }
}

async function loadUsageStats() {
  try {
    const resp = await fetch("./api/usage");
    const data = await resp.json();
    const cost = data.total_estimated_cost_usd || 0.0;
    const costEl = document.getElementById("total-cost-usd");
    if (costEl) costEl.textContent = `$${cost.toFixed(3)}`;
  } catch (err) {
    console.error("Failed to load usage:", err);
  }
}

function filterAndSortItems() {
  let filtered = [...catalogItems];

  // 1. KDC Category filter
  if (activeCategoryCode) {
    filtered = filtered.filter((it) => it.kdc_main_code === activeCategoryCode);
  }

  // 2. Search query filter
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter((it) => {
      const titleMatch = (it.title || "").toLowerCase().includes(q);
      const speakerMatch = (it.speakers || []).some((s) => s.toLowerCase().includes(q));
      const channelMatch = (it.channel || "").toLowerCase().includes(q);
      const tagMatch = (it.tags || []).some((t) => t.toLowerCase().includes(q));
      const topicMatch = (it.sub_topics || []).some((t) => t.toLowerCase().includes(q));
      const kdcMainMatch = (it.kdc_main_name || "").toLowerCase().includes(q);
      const kdcSubMatch = (it.kdc_sub_name || "").toLowerCase().includes(q);
      const kdcCodeMatch =
        (it.kdc_main_code || "").toLowerCase().includes(q) ||
        (it.kdc_sub_code || "").toLowerCase().includes(q);

      return (
        titleMatch ||
        speakerMatch ||
        channelMatch ||
        tagMatch ||
        topicMatch ||
        kdcMainMatch ||
        kdcSubMatch ||
        kdcCodeMatch
      );
    });
  }

  // Default sorting: Newest first (최근 등록순) with stable tie-breaker
  filtered.sort((a, b) => {
    const dateA = a.created_at || a.added_at || "";
    const dateB = b.created_at || b.added_at || "";
    const cmp = dateB.localeCompare(dateA);
    if (cmp !== 0) return cmp;
    return (b.video_id || "").localeCompare(a.video_id || "");
  });

  return filtered;
}

function renderGrid() {
  const container = document.getElementById("video-grid");
  const emptyState = document.getElementById("empty-state");
  const emptyMsg = document.getElementById("empty-state-message");
  const loadMoreContainer = document.getElementById("load-more-container");
  const loadMoreRemainingEl = document.getElementById("load-more-remaining-count");

  if (!container || !emptyState) return;

  const isFilterOrSearchActive = Boolean(searchQuery || activeCategoryCode);
  const items = filterAndSortItems();

  // If no items match
  if (items.length === 0) {
    container.innerHTML = "";
    container.style.display = "none";
    emptyState.style.display = "block";
    if (loadMoreContainer) loadMoreContainer.style.display = "none";

    const conditions = [];
    if (searchQuery) conditions.push(`검색어 "${searchQuery}"`);
    if (activeCategoryCode) conditions.push(`카테고리 "${activeCategoryName || activeCategoryCode}"`);

    if (conditions.length > 0) {
      emptyMsg.textContent = `적용된 조건(${conditions.join(", ")})에 해당하는 영상이 없습니다.`;
    } else {
      emptyMsg.textContent = "보관된 영상이 없습니다. '+ 영상 등록'을 통해 영상을 추가해 보세요.";
    }
    return;
  }

  emptyState.style.display = "none";

  // Check if search query matches a speaker in the filtered items
  const isSpeakerQuery = Boolean(
    searchQuery &&
    items.some((it) =>
      (it.speakers || []).some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  );

  if (isSpeakerQuery) {
    // Group by Channel, and within channel by Series & Episode
    container.className = "grouped-results-container";
    container.style.display = "block";
    container.innerHTML = renderGroupedByChannel(items);
    if (loadMoreContainer) loadMoreContainer.style.display = "none";
    return;
  }

  // Flat Grid Display
  container.className = "video-grid";
  container.style.display = "grid";

  const threeRowCount = get3RowCount();

  if (!isFilterOrSearchActive) {
    // Basic Home: Display ONLY the most recent 3 rows
    const itemsToRender = items.slice(0, threeRowCount);
    container.innerHTML = itemsToRender.map((it) => createCardHTML(it)).join("");

    // Hide Load More button on home default view
    if (loadMoreContainer) loadMoreContainer.style.display = "none";

  } else {
    // Filter / Search Active: Allow browsing entire library with Load More
    const itemsToRender = items.slice(0, visibleLimit);
    container.innerHTML = itemsToRender.map((it) => createCardHTML(it)).join("");

    if (visibleLimit < items.length) {
      if (loadMoreContainer) {
        loadMoreContainer.style.display = "flex";
        const remaining = items.length - itemsToRender.length;
        if (loadMoreRemainingEl) loadMoreRemainingEl.textContent = remaining;
      }
    } else {
      if (loadMoreContainer) loadMoreContainer.style.display = "none";
    }
  }
}

function renderGroupedByChannel(items) {
  // Group by channel_id
  const channelMap = new Map();
  [...items].sort((a, b) => a.video_id.localeCompare(b.video_id)).forEach((it) => {
    const cid = it.channel_id || it.channel || "default";
    if (!channelMap.has(cid)) {
      let cname = it.channel || "알 수 없음";
      channelMap.set(cid, { id: cid, name: cname, items: [] });
    }
    channelMap.get(cid).items.push(it);
  });

  const sortedChannels = Array.from(channelMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "ko")
  );

  return sortedChannels
    .map((ch) => {
      // Group by series within channel
      const seriesMap = new Map();
      const generalItems = [];

      ch.items.forEach((it) => {
        const parsed = parseSeriesAndEpisode(it.title);
        if (parsed.series) {
          if (!seriesMap.has(parsed.series)) seriesMap.set(parsed.series, []);
          seriesMap.get(parsed.series).push({ item: it, episode: parsed.episode });
        } else {
          generalItems.push(it);
        }
      });

      let seriesHTML = "";
      seriesMap.forEach((sitems, sname) => {
        // Sort episodes 1..N ascending, None (몰아보기/특집) at end
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
              <span style="font-size: 0.85rem; color: #94a3b8; font-weight: 500;">(${sitems.length}편)</span>
            </div>
            <div class="video-grid">
              ${sitems.map((si) => createCardHTML(si.item, si.episode)).join("")}
            </div>
          </div>
        `;
      });

      let generalHTML = "";
      if (generalItems.length > 0) {
        generalItems.sort((a, b) => {
          const dateA = a.created_at || a.added_at || "";
          const dateB = b.created_at || b.added_at || "";
          const cmp = dateB.localeCompare(dateA);
          if (cmp !== 0) return cmp;
          return (b.video_id || "").localeCompare(a.video_id || "");
        });

        generalHTML += `
          <div class="series-group-section" style="background: transparent; border: none; padding: 0;">
            ${seriesMap.size > 0 ? '<div class="series-group-title" style="color: #cbd5e1;"><span>🎬</span> 일반 영상</div>' : ""}
            <div class="video-grid">
              ${generalItems.map((it) => createCardHTML(it)).join("")}
            </div>
          </div>
        `;
      }

      return `
        <section class="channel-group-section">
          <div class="channel-group-header">
            <div class="channel-group-title">
              <span>📺</span>
              <span>${escapeHtml(ch.name)}</span>
            </div>
            <span class="stat-badge">${ch.items.length}편</span>
          </div>
          ${seriesHTML}
          ${generalHTML}
        </section>
      `;
    })
    .join("");
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

    lastFailedItems = failed;

    const banner = document.getElementById("batch-banner");
    const bannerSpinner = document.getElementById("batch-spinner");
    const bannerText = document.getElementById("batch-banner-text");
    const bannerDetail = document.getElementById("batch-banner-detail");
    const resumeBtn = document.getElementById("resume-batch-btn");
    const manageBtn = document.getElementById("manage-failures-btn");
    const failBadge = document.getElementById("failure-count-badge");

    if (!banner) return;

    if (processing.length > 0 || pending.length > 0) {
      banner.classList.add("visible");
      if (bannerSpinner) bannerSpinner.style.display = "block";
      const current = processing[0] || pending[0];
      bannerText.textContent = `배치 작업 진행 중: ${current.title || current.video_id || "영상 처리 중"}...`;
      bannerDetail.textContent = `(대기: ${pending.length}건, 완료/전체: ${items.filter((i) => i.status === "completed").length}/${items.length})`;
      if (resumeBtn) resumeBtn.style.display = "none";
      if (manageBtn) manageBtn.style.display = failed.length > 0 ? "inline-flex" : "none";
      if (failBadge) failBadge.textContent = failed.length;
    } else {
      if (bannerSpinner) bannerSpinner.style.display = "none";
      if (failed.length > 0) {
        banner.classList.add("visible");
        bannerText.textContent = `배치 작업 완료 (${failed.length}건 실패/접근제한)`;
        const firstReason = failed[0].short_reason || failed[0].error_message || "";
        bannerDetail.textContent = firstReason ? `사유: ${firstReason}` : "";

        if (manageBtn) {
          manageBtn.style.display = "inline-flex";
          if (failBadge) failBadge.textContent = failed.length;
        }

        // Show resume button only if there are non-restricted failed items
        const hasUnrestrictedFailures = failed.some((it) => !it.is_restricted);
        if (resumeBtn) {
          resumeBtn.style.display = hasUnrestrictedFailures ? "inline-flex" : "none";
        }
      } else {
        banner.classList.remove("visible");
        if (manageBtn) manageBtn.style.display = "none";
        if (resumeBtn) resumeBtn.style.display = "none";
        // Also close failure modal if it's currently open and 0 failures remain
        const failureModal = document.getElementById("failure-modal");
        if (failureModal && failureModal.classList.contains("active")) {
          failureModal.classList.remove("active");
        }
      }
    }

    // Update failure modal live if open
    const failureModal = document.getElementById("failure-modal");
    if (failureModal && failureModal.classList.contains("active")) {
      renderFailureModal(failed);
    }

    // If an item just finished, reload catalog
    const justCompleted = items.filter((it) => it.status === "completed");
    if (justCompleted.length > catalogItems.length) {
      await loadCatalog();
      await loadUsageStats();
    }
  } catch (err) {
    console.error("Batch polling error:", err);
  }
}

function renderFailureModal(failedItems) {
  const listContainer = document.getElementById("failure-items-list");
  if (!listContainer) return;

  if (!failedItems || failedItems.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: #94a3b8;">
        <span style="font-size: 2rem; display: block; margin-bottom: 0.5rem;">🎉</span>
        실패 또는 접근 제한된 영상 기록이 없습니다.
      </div>
    `;
    return;
  }

  listContainer.innerHTML = failedItems
    .map((item) => {
      const vid = item.video_id || "알 수 없음";
      const title = item.title || item.url || `Video (${vid})`;
      const isRestricted = Boolean(item.is_restricted);
      const badgeClass = isRestricted ? "badge-restricted" : "badge-failed";
      const badgeText = isRestricted ? "🔒 접근 제한 (Restricted)" : "❌ 실패 (Failed)";
      const reasonClass = isRestricted ? "restricted-reason" : "";
      const shortReason = item.short_reason || item.error_message || "원인 불명의 오류";
      const fullError = item.full_error || item.error_message || "";

      return `
        <div class="failure-item-card" data-item-id="${item.id}">
          <div class="failure-item-header">
            <div class="failure-item-title-group">
              <div class="failure-item-title">${escapeHtml(title)}</div>
              <div class="failure-item-submeta">
                <span>Video ID: <code>${escapeHtml(vid)}</code></span>
                ${item.channel ? `<span>채널: ${escapeHtml(item.channel)}</span>` : ""}
                ${item.added_at ? `<span>등록: ${escapeHtml(item.added_at.slice(0, 16).replace("T", " "))}</span>` : ""}
              </div>
            </div>
            <span class="failure-badge ${badgeClass}">${badgeText}</span>
          </div>

          <div class="failure-short-reason ${reasonClass}">
            ${escapeHtml(shortReason)}
          </div>

          ${
            fullError
              ? `
            <div class="failure-full-error-box" id="error-box-${item.id}">${escapeHtml(fullError)}</div>
          `
              : ""
          }

          <div class="failure-item-actions">
            <div>
              ${
                fullError
                  ? `
                <button type="button" class="btn-toggle-error" onclick="toggleErrorBox('${item.id}')">
                  오류 전문 보기
                </button>
              `
                  : ""
              }
            </div>
            <div style="display: flex; gap: 0.5rem;">
              <button type="button" class="btn-retry-item" onclick="retryQueueItem('${item.id}')">
                🔄 재시도
              </button>
              <button type="button" class="btn-delete-item" onclick="deleteQueueItem('${item.id}', '${escapeHtml(title)}')">
                🗑️ 기록 삭제
              </button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

window.toggleErrorBox = function (itemId) {
  const box = document.getElementById(`error-box-${itemId}`);
  if (!box) return;
  const isShown = box.style.display === "block";
  box.style.display = isShown ? "none" : "block";
};

window.retryQueueItem = async function (itemId) {
  try {
    const resp = await fetch(`./api/batch/retry/${itemId}`, { method: "POST" });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "재시도 요청 실패");
    await checkBatchStatus();
  } catch (err) {
    alert("재시도 요청 실패: " + err.message);
  }
};

window.deleteQueueItem = async function (itemId, videoTitle) {
  const confirmed = confirm(
    `'${videoTitle}'의 실패 기록을 큐에서 삭제하시겠습니까?\n\n` +
    `⚠️ 주의: 실패 큐 항목과 알림만 제거되며, 기존의 성공 보관 영상 및 데이터는 일체 영향받지 않습니다.`
  );
  if (!confirmed) return;

  try {
    const resp = await fetch(`./api/batch/item/${itemId}`, { method: "DELETE" });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "삭제 실패");
    await checkBatchStatus();
  } catch (err) {
    alert("기록 삭제 실패: " + err.message);
  }
};

function escapeHtml(text) {
  if (!text) return "";
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
