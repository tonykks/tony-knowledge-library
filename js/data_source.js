// The serving page declares capabilities. API failure never changes modes.
window.DataSource = (() => {
  const mode = document.querySelector('meta[name="yka-mode"]')?.content;
  if (!["local", "public"].includes(mode)) throw new Error("도서관 모드가 지정되지 않았습니다.");
  const isLocal = mode === "local";
  const validId = (id) => /^[A-Za-z0-9_-]{11}$/.test(id);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function read(url, options = {}) {
    const response = await fetch(url, { cache: "no-store", ...options });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error("데이터를 읽을 수 없습니다."); }
    if (!response.ok) {
      const error = new Error(data.error || "요청을 완료하지 못했습니다.");
      error.status = response.status;
      throw error;
    }
    return { data, text };
  }

  async function checkHash(text, expected) {
    if (!expected) throw new Error("공개 자료 검증 정보가 없습니다.");
    if (window.crypto?.subtle) {
      const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      const hash = [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
      if (hash !== expected) throw new Error("사이트 갱신 중입니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  async function publicBundle(videoId = null) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { data: manifest } = await read(`./data/manifest.json?v=${Date.now()}`);
        const catalog = await read(`./data/catalog.json?v=${encodeURIComponent(manifest.revision)}`);
        if (catalog.data.revision !== manifest.revision || catalog.data.total_items !== manifest.total_items) {
          throw new Error("사이트 갱신 중입니다.");
        }
        await checkHash(catalog.text, manifest.files["data/catalog.json"]);
        if (!videoId) return catalog.data;
        if (!catalog.data.items.some((i) => i.video_id === videoId)) {
          const error = new Error("공개 목록에 없는 영상입니다."); error.status = 404; throw error;
        }
        const name = `data/videos/${videoId}.json`;
        const video = await read(`./${name}?v=${encodeURIComponent(manifest.revision)}`);
        await checkHash(video.text, manifest.files[name]);
        if (video.data.metadata.video_id !== videoId) throw new Error("영상 정보가 일치하지 않습니다.");
        return video.data;
      } catch (error) {
        if (error.status === 404) throw error;
        lastError = error;
        if (attempt < 2) await sleep(250 * (attempt + 1));
      }
    }
    throw lastError;
  }

  async function api(path, options = {}) {
    if (!isLocal) throw new Error("읽기 전용 도서관입니다.");
    return (await read(`./api/${path}`, options)).data;
  }

  return {
    isLocal,
    activateLocalControls() {
      if (isLocal) document.querySelectorAll("[data-local-only]").forEach((node) => { node.hidden = false; });
    },
    async catalog(visibility = "active", q = "") {
      if (isLocal) return api(`catalog?${new URLSearchParams({ visibility, q })}`);
      if (visibility !== "active") throw new Error("읽기 전용 도서관입니다.");
      return publicBundle();
    },
    async video(id) {
      if (!validId(id)) throw new Error("유효하지 않은 영상 ID입니다.");
      return isLocal ? api(`video/${id}`) : publicBundle(id);
    },
    async categories() {
      return isLocal ? api("categories") : (await read("./data/categories.json")).data;
    },
    async mutate(id, action, body) {
      if (!validId(id) || !["edit", "hide", "restore"].includes(action)) throw new Error("잘못된 요청입니다.");
      return api(`video/${id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    },
    syncStatus: () => api("sync/status"),
    api,
  };
})();
