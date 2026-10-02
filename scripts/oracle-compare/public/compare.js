const EDITOR_ORIGIN = "https://www.kimi.com";
const PINNED_PENPAL =
  "https://statics.moonshot.cn/neo-design/assets/penpal-C4NjirZE.js";

const $ = (id) => document.getElementById(id);

const state = {
  project: new URLSearchParams(location.search).get("project") || "yu7",
  page: Number(new URLSearchParams(location.search).get("page") || 0) || 0,
  remote: null,
  connection: null,
  lastPayload: null,
  connected: false,
  officialError: "",
  remoteMethods: [],
  title: "",
  pageCount: 0,
};

function setStatus(text) {
  $("status").textContent = text;
}

function setOverlay(text, visible = true) {
  const el = $("official-overlay");
  el.textContent = text;
  el.classList.toggle("is-hidden", !visible);
}

function mediaUrl(src) {
  if (!src) return "";
  if (/^(https?:|data:|blob:)/i.test(src)) return src;
  return `/media/${src.replace(/^\/+/, "")}?project=${encodeURIComponent(state.project)}`;
}

async function api(path) {
  const res = await fetch(path);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function editorQuery() {
  return new URLSearchParams({
    sdkMode: "ppt-editor",
    pptPlatform: "neodeck-local",
    functional: JSON.stringify({
      fullscreen: true,
      present: true,
      export: true,
      close: false,
      annotation: true,
      feedback: false,
      share: true,
      versionHistory: true,
    }),
    sdkSaveMode: "external",
    sdkImageMode: "external",
  });
}

async function resolvePenpalModule() {
  try {
    const data = await api("/api/penpal-url");
    if (data.url) return data.url;
  } catch {
    // use pin
  }
  return PINNED_PENPAL;
}

async function getImages(payload = {}) {
  const paths = Array.isArray(payload.filePath) ? payload.filePath : [];
  if (!paths.length) return [];
  const data = await api(
    `/api/images?project=${encodeURIComponent(state.project)}&paths=${encodeURIComponent(JSON.stringify(paths))}`,
  );
  return data.images || [];
}

function onSave(payload) {
  return {
    fileContent: payload?.fileContent,
    lastModifiedTime: Date.now(),
  };
}

async function setOfficialDeck(payload) {
  if (!state.remote) throw new Error("official iframe not connected");
  state.lastPayload = payload;
  await state.remote.setPPTD(payload.id, {
    pptdContent: payload.manifestContent,
    pages: payload.pages,
    basePath: payload.basePath,
    pptdPath: payload.manifestPath,
    isCreate: true,
  });
  await state.remote.setEditable(true);
  const status = await state.remote.getSlideStatus().catch(() => null);
  return status;
}

async function tryOfficialPage(index) {
  const remote = state.remote;
  if (!remote) return false;
  const pagePath = state.lastPayload?.pages?.[index]?.path;
  const names = [
    "setCurrentPage",
    "goToPage",
    "setPageIndex",
    "setActivePage",
    "selectPage",
    "switchPage",
  ];
  const argsList = [index, index + 1, pagePath].filter((v) => v != null && v !== "");
  for (const name of names) {
    const fn = remote[name];
    if (typeof fn !== "function") continue;
    for (const arg of argsList) {
      try {
        await fn.call(remote, arg);
        return name;
      } catch {
        // try next signature
      }
    }
  }
  return false;
}

async function loadOfficialPage(index) {
  const payload = state.lastPayload;
  if (!payload?.pages?.[index] || !state.remote) return;
  const page = payload.pages[index];
  let manifest = String(payload.manifestContent || "");
  if (/pages:\s*\n(?:[ \t]*-[ \t]*.+\n?)+/.test(manifest)) {
    manifest = manifest.replace(
      /pages:\s*\n(?:[ \t]*-[ \t]*.+\n?)+/,
      `pages:\n  - ${page.path}\n`,
    );
  }
  await state.remote.setPPTD(`${payload.id}-p${index}`, {
    pptdContent: manifest,
    pages: [page],
    basePath: payload.basePath,
    pptdPath: payload.manifestPath,
    isCreate: true,
  });
}

function paintCompareLine(el, w, h) {
  const color = el.border?.color || "#111";
  const width = el.border?.width || 3;
  const pts = String(el.linePoints || "")
    .trim()
    .split(/\s+/)
    .map((p) => p.split(",").map(Number))
    .filter((p) => p.length === 2 && p.every(Number.isFinite));
  const d =
    pts.length >= 2
      ? pts.map((p, i) => `${i ? "L" : "M"} ${p[0]} ${p[1]}`).join(" ")
      : `M 0 ${h / 2} L ${w} ${h / 2}`;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" overflow="visible"><path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round"/></svg>`;
}

function paintCompareChart(el) {
  const rows = el.chartData?.rows || [];
  const vals = rows.map((r) => Number(r[1]) || 0);
  const max = Math.max(1, ...vals);
  const w = el.bounds[2];
  const h = el.bounds[3];
  const title = el.chartTitle || "";
  const padL = 36;
  const padR = 16;
  const padT = title ? 28 : 16;
  const padB = 28;
  const iw = w - padL - padR;
  const ih = h - padT - padB;
  const gap = 16;
  const bw = rows.length ? (iw - gap * (rows.length - 1)) / rows.length : iw;
  const colors = el.chartColors?.length ? el.chartColors : ["#2563EB", "#F59E0B", "#10B981"];
  const ticks = 5;
  const grid = Array.from({ length: ticks + 1 }, (_, i) => {
    const y = padT + (ih * i) / ticks;
    const label = Math.round(max * (1 - i / ticks));
    return `<line x1="${padL}" y1="${y}" x2="${padL + iw}" y2="${y}" stroke="#E5E7EB" stroke-width="1"/><text x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="#6B7280">${label}</text>`;
  }).join("");
  const bars = vals.map((v, i) => {
    const bh = (v / max) * ih;
    const x = padL + i * (bw + gap);
    const y = padT + ih - bh;
    const fill = colors[0] || "#2563EB";
    return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${fill}"></rect><text x="${x + bw / 2}" y="${padT + ih + 16}" text-anchor="middle" font-size="10" fill="#6B7280">${rows[i]?.[0] ?? ""}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%"><text x="12" y="16" font-size="14" fill="#111">${title}</text>${grid}${bars.join("")}</svg>`;
}

function renderNative(model) {
  const slide = $("slide");
  const stage = $("native-stage");
  const [sw, sh] = model.size;
  slide.style.width = `${sw}px`;
  slide.style.height = `${sh}px`;
  if (model.backgroundImage) {
    slide.style.backgroundImage = `url("${mediaUrl(model.backgroundImage)}")`;
    slide.style.backgroundColor = model.backgroundCss || "#111";
  } else {
    slide.style.backgroundImage = "none";
    slide.style.background = model.backgroundCss || "#fff";
  }
  slide.innerHTML = "";
  for (const el of model.elements) {
    const [x, y, w, h] = el.bounds;
    const node = document.createElement("div");
    node.className = `el ${el.type}`;
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    node.style.width = `${w}px`;
    node.style.height = `${h}px`;
    node.style.opacity = String(el.opacity ?? 1);
    if (el.rotation) node.style.transform = `rotate(${el.rotation}deg)`;
    if (el.type === "text") {
      node.style.color = el.color || "#111";
      node.style.fontSize = `${el.fontSize || 18}px`;
      node.style.fontWeight = el.bold ? "700" : "400";
      node.style.fontStyle = el.italic ? "italic" : "normal";
      node.style.fontFamily = el.fontFamily || "inherit";
      node.style.lineHeight = el.lineHeight ? String(el.lineHeight) : "1.25";
      if (el.letterSpacing) node.style.letterSpacing = `${el.letterSpacing}px`;
      if (el.align) {
        node.style.textAlign = el.align[0] || "left";
        node.style.display = "flex";
        node.style.alignItems =
          el.align[1] === "middle"
            ? "center"
            : el.align[1] === "bottom"
              ? "flex-end"
              : "flex-start";
      }
      const runs = Array.isArray(el.runs) && el.runs.length ? el.runs : null;
      if (runs) {
        for (const run of runs) {
          const span = document.createElement("span");
          span.textContent = run.text ?? "";
          if (run.fontSize) span.style.fontSize = `${run.fontSize}px`;
          if (run.color) span.style.color = run.color;
          if (run.bold) span.style.fontWeight = "700";
          if (run.italic) span.style.fontStyle = "italic";
          node.append(span);
        }
      } else {
        node.textContent = el.text || "";
      }
    } else if (el.type === "shape") {
      node.style.background = "transparent";
      node.style.overflow = "visible";
      const stroke = el.border?.color || (el.pathStroke ? "#111" : "none");
      const swid = el.border?.width || (el.pathStroke ? 1.5 : 0);
      const d = el.pathD;
      if (d) {
        node.innerHTML = globalThis.shapePaintMarkup({
          fillCss: el.fillCss,
          border: { color: stroke, width: swid },
          pathD: d,
          pathStroke: el.pathStroke,
        });
      } else {
        node.style.background = el.fillCss || "transparent";
        if (el.shapeName === "ellipse") node.style.borderRadius = "50%";
        if (el.shapeName === "roundRect") node.style.borderRadius = "12px";
      }
    } else if (el.type === "image" && el.src) {
      node.style.backgroundImage = `url("${mediaUrl(el.src)}")`;
    } else if (el.type === "table" && el.tableRows) {
      node.style.background = "transparent";
      const table = document.createElement("table");
      table.className = "el-table";
      table.style.width = "100%";
      table.style.height = "100%";
      table.style.borderCollapse = "collapse";
      table.style.fontSize = "12px";
      table.style.color = "#111";
      for (const row of el.tableRows) {
        const tr = document.createElement("tr");
        for (const cell of row) {
          const td = document.createElement("td");
          td.textContent = cell.text || "";
          td.style.border = "1px solid #d1d5db";
          td.style.padding = "4px 6px";
          if (cell.bold) td.style.fontWeight = "700";
          if (cell.fill) td.style.background = cell.fill;
          if (cell.align?.[0]) td.style.textAlign = cell.align[0];
          tr.append(td);
        }
        table.append(tr);
      }
      node.append(table);
    } else if (el.type === "chart") {
      node.style.background = "transparent";
      node.innerHTML = paintCompareChart(el);
    } else if (el.type === "line") {
      node.style.background = "transparent";
      node.innerHTML = paintCompareLine(el, w, h);
    } else if (el.type === "icon") {
      node.style.background = el.fillCss || "#000000";
      node.style.borderRadius = "4px";
    }
    slide.append(node);
  }
  const pad = 24;
  const scale = Math.min(
    (stage.clientWidth - pad) / sw,
    (stage.clientHeight - pad) / sh,
    1.2,
  );
  slide.style.transformOrigin = "top left";
  slide.style.transform = `scale(${scale})`;
  slide.style.position = "absolute";
  slide.style.left = `${Math.max(0, (stage.clientWidth - sw * scale) / 2)}px`;
  slide.style.top = `${Math.max(0, (stage.clientHeight - sh * scale) / 2)}px`;
}

function applyView(view) {
  const allowed = new Set(["split", "official", "native"]);
  const next = allowed.has(view) ? view : "split";
  document.body.classList.remove("view-split", "view-official", "view-native");
  document.body.classList.add(`view-${next}`);
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.classList.toggle("on", btn.getAttribute("data-view") === next);
  });
  const url = new URL(location.href);
  if (next === "split") url.searchParams.delete("view");
  else url.searchParams.set("view", next);
  history.replaceState(null, "", url);
  loadNative().catch(() => undefined);
}

function renderPager(pageCount) {
  const pager = $("pager");
  pager.innerHTML = "";
  for (let i = 0; i < pageCount; i += 1) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = String(i + 1);
    btn.className = i === state.page ? "active" : "";
    btn.addEventListener("click", () => loadPage(i));
    pager.append(btn);
  }
}

async function loadNative() {
  const data = await api(
    `/api/model?project=${encodeURIComponent(state.project)}&page=${state.page}`,
  );
  state.title = data.model.title;
  state.pageCount = data.model.pageCount;
  renderPager(data.model.pageCount);
  renderNative(data.model);
  return data;
}

async function loadOfficial() {
  const data = await api(`/api/deck?project=${encodeURIComponent(state.project)}`);
  const status = await setOfficialDeck(data.payload);
  setOverlay("", false);
  return { data, status };
}

async function loadPage(index) {
  state.page = index;
  const url = new URL(location.href);
  url.searchParams.set("project", state.project);
  url.searchParams.set("page", String(index));
  history.replaceState(null, "", url);
  await loadNative();
  const moved = await tryOfficialPage(index);
  if (!moved) await loadOfficialPage(index);
}

async function loadProject(id) {
  state.project = id;
  state.page = 0;
  const url = new URL(location.href);
  url.searchParams.set("project", id);
  url.searchParams.set("page", "0");
  history.replaceState(null, "", url);
  setStatus(`载入 ${id}…`);
  const native = await loadNative();
  if (state.connected) {
    try {
      await loadOfficial();
      setStatus(`已对照 · ${native.model.title} · ${native.model.pageCount} 页`);
    } catch (error) {
      state.officialError = error.message;
      setOverlay(`官方载入失败：${error.message}`, true);
      setStatus(`Native 已载入 · 官方失败`);
    }
  } else {
    setStatus(`Native 已载入 · 等待官方 iframe`);
  }
}

async function connectOfficial() {
  setOverlay("正在连接官方 neo-ppt…", true);
  setStatus("连接官方 iframe…");
  const frame = $("kimi");
  frame.src = `${EDITOR_ORIGIN}/neo-ppt/?${editorQuery()}`;
  const penpalUrl = await resolvePenpalModule();
  try {
    const [{ i: connect, r: WindowMessenger }] = await Promise.all([
      import(penpalUrl),
      new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("iframe load timeout")), 25_000);
        frame.addEventListener(
          "load",
          () => {
            clearTimeout(timeout);
            resolve();
          },
          { once: true },
        );
      }),
    ]);
    const messenger = new WindowMessenger({
      remoteWindow: frame.contentWindow,
      allowedOrigins: [EDITOR_ORIGIN],
    });
    state.connection = connect({
      messenger,
      methods: {
        close() {},
        reenter() {
          return state.lastPayload ? setOfficialDeck(state.lastPayload) : undefined;
        },
        toggleFullScreen() {
          return false;
        },
        showFeedback() {},
        sendPrompt() {},
        showMessage() {},
        hideMessage() {},
        onSave,
        getImages,
        setAnnotationMode() {},
        setAnnotationCurrentPage() {},
        upsertAnnotation() {},
        removeAnnotation() {},
        clearAnnotations() {},
      },
    });
    state.remote = await Promise.race([
      state.connection.promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("RPC handshake timeout")), 25_000)),
    ]);
    state.remoteMethods = Object.keys(state.remote || {});
    await state.remote.setSlideConfig({ editable: true, locale: "zh-CN", theme: "light" });
    state.connected = true;
    state.officialError = "";
    await loadOfficial();
    setStatus(`官方已连接 · ${state.title || state.project}`);
  } catch (error) {
    state.connected = false;
    state.officialError = error.message;
    setOverlay(`无法连接官方 iframe：${error.message}`, true);
    setStatus(`官方连接失败：${error.message}`);
  }
}

async function boot() {
  const list = await api("/api/projects");
  const select = $("project");
  for (const p of list.projects) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.label}${p.exists ? "" : "（缺失）"}`;
    opt.disabled = !p.exists;
    if (p.id === state.project || p.path === state.project) opt.selected = true;
    select.append(opt);
  }
  select.addEventListener("change", () => loadProject(select.value));
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => applyView(btn.getAttribute("data-view")));
  });
  applyView(new URLSearchParams(location.search).get("view") || "split");
  await loadNative();
  await connectOfficial();
}

window.oracleCompare = {
  getStatus() {
    return {
      connected: state.connected,
      project: state.project,
      page: state.page,
      title: state.title,
      pageCount: state.pageCount,
      officialError: state.officialError,
      remoteMethods: state.remoteMethods,
      view: document.body.className.match(/view-(\w+)/)?.[1] || "split",
    };
  },
  loadProject,
  loadPage,
  applyView,
  officialStatus: () => state.remote?.getSlideStatus?.(),
  getPPTD: () => state.remote?.getPPTD?.(),
};

window.addEventListener("resize", () => {
  loadNative().catch(() => undefined);
});

boot().catch((error) => {
  setStatus(error.message);
  setOverlay(error.message, true);
});
