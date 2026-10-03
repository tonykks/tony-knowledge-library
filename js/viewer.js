let currentVideoId = "";
let videoPayload = null;
let draft = null;
let ytPlayer = null;
let categories = [];
let fieldNumber = 0;
const summarySections = [
  ["overview", "한눈에 보는 전체 요약"], ["narrative_flow", "전체 이야기와 논리의 흐름"],
  ["core_points", "핵심 내용과 근거"], ["key_examples", "대표 사례와 비유"],
  ["key_facts", "인물·사건·숫자·용어"], ["conclusion", "결론 및 시사점"],
];
const $ = (id) => document.getElementById(id);
const el = (tag, text = "", className = "") => {
  const node = document.createElement(tag); node.textContent = text; node.className = className; return node;
};

document.addEventListener("DOMContentLoaded", async () => {
  currentVideoId = new URLSearchParams(location.search).get("id");
  setupTabs();
  DataSource.activateLocalControls();
  try {
    videoPayload = await DataSource.video(currentVideoId);
    renderAll();
    loadPlayer();
    if (DataSource.isLocal) {
      $("edit-btn").disabled = false; $("hide-btn").disabled = false;
      $("edit-btn").addEventListener("click", beginEdit);
      $("save-btn").addEventListener("click", saveEdit);
      $("cancel-edit-btn").addEventListener("click", cancelEdit);
      $("hide-btn").addEventListener("click", changeHidden);
      refreshSync();
      setInterval(refreshSync, 4000);
    }
  } catch (error) {
    $("viewer-header-title").textContent = "노트를 불러올 수 없습니다";
    showMessage(error.message, true);
  }
});

window.addEventListener("beforeunload", (event) => {
  if (draft) { event.preventDefault(); event.returnValue = ""; }
});

function showMessage(message, error = false) {
  $("viewer-message").textContent = message;
  $("viewer-message").className = error ? "error-message" : "";
}

function setupTabs() {
  const buttons = [...document.querySelectorAll(".tab-btn")];
  const activate = (button) => {
    buttons.forEach((b) => {
      b.classList.toggle("active", b === button);
      b.setAttribute("aria-selected", String(b === button)); b.tabIndex = b === button ? 0 : -1;
      $(b.dataset.tab).classList.toggle("active", b === button);
    });
  };
  buttons.forEach((button, index) => {
    button.addEventListener("click", () => activate(button));
    button.addEventListener("keydown", (event) => {
      if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = buttons[event.key === "Home" ? 0 : event.key === "End" ? 1 : (index + 1) % 2];
        activate(next); next.focus();
      }
    });
  });
}

function loadPlayer() {
  window.onYouTubeIframeAPIReady = () => {
    if (ytPlayer || !videoPayload) return;
    ytPlayer = new YT.Player("youtube-player", { height: "100%", width: "100%", videoId: currentVideoId,
      playerVars: { playsinline: 1, rel: 0 } });
  };
  if (window.YT?.Player) window.onYouTubeIframeAPIReady();
  else { const script = document.createElement("script"); script.src = "https://www.youtube.com/iframe_api"; document.head.append(script); }
}

function timeText(value) {
  const seconds = Math.floor(value), hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60, rest = seconds % 60;
  return (hours ? `${String(hours).padStart(2, "0")}:` : "") + `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function timestampLink(seconds, label = "") {
  const link = el("a", `${timeText(seconds)}${label ? ` · ${label}` : ""}`, "timestamp-btn");
  link.href = `https://youtu.be/${currentVideoId}?t=${Math.floor(seconds)}`;
  link.target = "_blank"; link.rel = "noopener noreferrer";
  link.addEventListener("click", (event) => {
    if (ytPlayer?.seekTo && ytPlayer?.playVideo) { event.preventDefault(); ytPlayer.seekTo(seconds, true); ytPlayer.playVideo(); }
  });
  return link;
}

function field(label, value, onChange, { multiline = false, number = false } = {}) {
  const wrap = el("div", "", "edit-field");
  const input = document.createElement(multiline ? "textarea" : "input");
  const id = `edit-field-${++fieldNumber}`;
  const caption = el("label", label); caption.htmlFor = id; input.id = id;
  if (number) { input.type = "number"; input.min = "0"; input.step = "any"; }
  if (multiline) input.rows = 3;
  input.value = value ?? "";
  input.addEventListener("input", () => onChange(number ? (input.value === "" ? null : Number(input.value)) : input.value));
  wrap.append(caption, input); return wrap;
}

function action(text, callback) {
  const button = el("button", text, "btn-secondary edit-list-action"); button.type = "button";
  button.addEventListener("click", callback); return button;
}

function editList(container, values, label, renderEntry, refresh) {
  values.forEach((value, index) => {
    const row = el("div", "", "edit-list-row");
    renderEntry(row, value, index);
    row.append(action(`${label} ${index + 1} 제거`, () => { values.splice(index, 1); refresh(); }));
    container.append(row);
  });
}

function stringList(container, values, label, refresh) {
  editList(container, values, label, (row, value, i) => row.append(field(`${label} ${i + 1}`, value, (v) => values[i] = v, { multiline: true })), refresh);
  container.append(action(`${label} 추가`, () => { values.push(""); refresh(); container.querySelector(".edit-list-row:last-of-type textarea")?.focus(); }));
}

function renderAll() {
  const data = draft || videoPayload;
  $("viewer-header-title").textContent = data.metadata.title;
  document.title = `${data.metadata.title} — 학습 노트`;
  $("open-youtube-original-btn").href = `https://youtu.be/${currentVideoId}`;
  $("hide-btn").textContent = videoPayload.metadata.is_hidden ? "복원" : "숨김";
  renderMetadata(); renderDetail(); renderSummary();
}

function renderMetadata() {
  const meta = (draft || videoPayload).metadata, box = $("metadata-container"); box.replaceChildren();
  if (draft) {
    box.append(field("영상 제목", meta.title, (v) => { meta.title = v; $("viewer-header-title").textContent = v; }));
    box.append(field("채널명", meta.channel, (v) => meta.channel = v));
    for (const [key, label] of [["speakers", "강연자"], ["tags", "태그"], ["sub_topics", "세부 주제"]]) {
      const group = el("fieldset"); group.append(el("legend", label));
      stringList(group, meta[key], label, renderMetadata); box.append(group);
    }
    const main = document.createElement("select"), sub = document.createElement("select");
    main.setAttribute("aria-label", "KDC 대분류"); sub.setAttribute("aria-label", "KDC 중분류");
    for (const c of categories) { const option = new Option(`${c.code} ${c.name}`, c.code); main.add(option); }
    main.value = meta.kdc_main_code;
    const updateSubs = () => {
      sub.replaceChildren();
      const category = categories.find((c) => c.code === main.value);
      for (const s of category?.sub_categories || []) sub.add(new Option(`${s.code} ${s.name}`, s.code));
      sub.value = meta.kdc_sub_code;
      if (!sub.value) sub.selectedIndex = 0;
      meta.kdc_main_code = main.value; meta.kdc_sub_code = sub.value;
    };
    main.addEventListener("change", updateSubs); sub.addEventListener("change", () => meta.kdc_sub_code = sub.value); updateSubs();
    const kdc = el("div", "", "edit-field"); kdc.append(el("span", "KDC 분류"), main, sub); box.append(kdc);
    box.append(field("영상 길이 (초)", meta.duration_sec, (v) => meta.duration_sec = v, { number: true }));
    box.append(field("영상 게시일", meta.published_date, (v) => meta.published_date = v));
  } else {
    box.append(el("h2", meta.title, "viewer-meta-title"));
    for (const text of [`채널: ${meta.channel}`, `강연자: ${(meta.speakers || []).join(", ") || "미지정"}`,
      `[${meta.kdc_main_code}] ${meta.kdc_main_name} > ${meta.kdc_sub_name}`, `길이: ${meta.duration_str}`]) {
      box.append(el("p", text, "metadata-line"));
    }
    if (meta.published_date) box.append(el("p", `영상 게시일: ${meta.published_date}`, "metadata-line"));
    if (meta.sub_topics?.length) box.append(el("p", `세부 주제: ${meta.sub_topics.join(", ")}`, "metadata-line"));
    const tags = el("div", "", "card-tags"); (meta.tags || []).forEach((t) => tags.append(el("span", `#${t}`, "card-tag"))); box.append(tags);
    if (meta.is_hidden) box.append(el("p", "숨긴 영상", "note-hint"));
  }
}

function renderDetail() {
  const box = $("detail-items-container"), items = (draft || videoPayload).detail.items; box.replaceChildren();
  if (draft) {
    editList(box, items, "상세 항목", (row, item, index) => {
      row.append(field(`상세 ${index + 1} 시각 (초)`, item.timestamp_sec, (v) => item.timestamp_sec = v, { number: true }),
        field(`상세 ${index + 1} 소제목`, item.topic, (v) => item.topic = v),
        field(`상세 ${index + 1} 본문`, item.content, (v) => item.content = v, { multiline: true }));
    }, renderDetail);
    box.append(action("상세 항목 추가", () => { items.push({ timestamp_sec: 0, topic: "", content: "" }); renderDetail(); }));
  } else {
    for (const item of items) {
      const card = el("div", "", "detail-item-card"), header = el("div", "", "detail-item-header");
      header.append(timestampLink(item.timestamp_sec), el("span", item.topic, "detail-item-topic"));
      card.append(header, el("div", item.content, "detail-item-content")); box.append(card);
    }
    if (!items.length) box.append(el("p", "순차적 정리 항목이 없습니다.", "note-hint"));
  }
}

function renderMarkdownText(text) {
  const container = el("div", "", "summary-content");
  if (!text) return container;
  const lines = text.split("\n");
  let currentList = null;

  const flushList = () => {
    if (currentList) {
      container.append(currentList);
      currentList = null;
    }
  };

  let paragraphLines = [];
  const flushParagraph = () => {
    flushList();
    if (paragraphLines.length) {
      const p = el("p", paragraphLines.join(" "), "summary-paragraph");
      container.append(p);
      paragraphLines = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      continue;
    }
    if (line.startsWith("### ")) {
      flushParagraph();
      container.append(el("h4", line.slice(4), "summary-subheading-3"));
    } else if (line.startsWith("## ")) {
      flushParagraph();
      container.append(el("h3", line.slice(3), "summary-subheading-2"));
    } else if (line.startsWith("# ")) {
      flushParagraph();
      container.append(el("h2", line.slice(2), "summary-subheading-1"));
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      flushParagraph();
      if (!currentList) currentList = el("ul", "", "summary-list");
      currentList.append(el("li", line.slice(2)));
    } else {
      if (currentList) flushList();
      paragraphLines.push(line);
    }
  }
  flushParagraph();
  return container;
}

function renderSummary() {
  const summary = (draft || videoPayload).summary, box = $("summary-container");
  box.replaceChildren();
  if (draft) {
    const section = el("section", "", "summary-section");
    section.append(el("h3", "요점정리 통합 노트"));
    const textWrap = field("요점정리 본문 (소제목 ## 및 문단 사용 가능)", summary.summary_text || "", (v) => {
      summary.summary_text = v;
    }, { multiline: true });
    const textarea = textWrap.querySelector("textarea");
    if (textarea) textarea.rows = 18;
    section.append(textWrap);
    box.append(section);
  } else {
    const text = summary.summary_text || "";
    if (text) {
      const section = el("section", "", "summary-section");
      section.append(renderMarkdownText(text));
      box.append(section);
    } else {
      box.append(el("p", "요점정리 내용이 없습니다.", "note-hint"));
    }
  }
}

async function beginEdit() {
  try {
    categories = (await DataSource.categories()).main_categories;
    draft = structuredClone(videoPayload);
    $("edit-btn").hidden = true; $("hide-btn").hidden = true;
    $("save-btn").hidden = false; $("cancel-edit-btn").hidden = false;
    showMessage("내용을 직접 수정한 뒤 저장하세요."); renderAll();
    $("metadata-container").querySelector("input")?.focus();
  } catch (error) { showMessage(error.message, true); }
}

function cancelEdit() {
  draft = null;
  $("edit-btn").hidden = false; $("hide-btn").hidden = false;
  $("save-btn").hidden = true; $("cancel-edit-btn").hidden = true;
  showMessage(""); renderAll(); $("edit-btn").focus();
}

async function saveEdit() {
  if (!draft) return;
  const metadata = {};
  for (const key of ["title", "channel", "speakers", "tags", "sub_topics", "kdc_main_code", "kdc_sub_code", "duration_sec", "published_date"]) {
    if (JSON.stringify(draft.metadata[key]) !== JSON.stringify(videoPayload.metadata[key])) metadata[key] = draft.metadata[key];
  }
  const body = { expected_revision: videoPayload.revision, metadata,
    detail: { items: draft.detail.items.map(({ timestamp_sec, topic, content }) => ({ timestamp_sec, topic, content })) } };
  const summary = {};
  if (draft.summary.summary_text !== videoPayload.summary.summary_text) {
    summary.summary_text = draft.summary.summary_text;
  }
  for (const key of ["overview", "narrative_flow", "core_points", "key_examples", "key_facts", "conclusion"]) {
    if (draft.summary[key] !== undefined && JSON.stringify(draft.summary[key]) !== JSON.stringify(videoPayload.summary[key])) {
      summary[key] = draft.summary[key];
    }
  }
  if (Object.keys(summary).length) body.summary = summary;
  $("save-btn").disabled = true; $("cancel-edit-btn").disabled = true;
  try {
    videoPayload = await DataSource.mutate(currentVideoId, "edit", body);
    cancelEdit(); showMessage(videoPayload.sync.message); refreshSync();
  } catch (error) { showMessage(`저장 실패: ${error.message}`, true); }
  finally { $("save-btn").disabled = false; $("cancel-edit-btn").disabled = false; }
}

async function changeHidden() {
  $("hide-btn").disabled = true;
  try {
    await DataSource.mutate(currentVideoId, videoPayload.metadata.is_hidden ? "restore" : "hide", { expected_revision: videoPayload.revision });
    location.href = "./index.html";
  } catch (error) { showMessage(error.message, true); $("hide-btn").disabled = false; }
}

async function refreshSync() {
  try { $("sync-status").textContent = (await DataSource.syncStatus()).message; }
  catch { $("sync-status").textContent = "공개 반영 상태를 확인할 수 없습니다."; }
}
