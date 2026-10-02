import {
  assertWritableChangePath,
  basename,
  dirname,
  extractPagePaths,
  joinDeckPath,
  normalizeRelativePath,
  titleFromManifest,
} from "./lib.js";

const EDITOR_ORIGIN = "https://www.kimi.com";
const PENPAL_MODULE = "https://statics.moonshot.cn/neo-design/assets/penpal-C4NjirZE.js";
const MAX_TEXT_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_CHANGE_COUNT = 600;

const elements = {
  frame: document.querySelector("#editor"),
  openFolder: document.querySelector("#open-folder"),
  openDemo: document.querySelector("#open-demo"),
  reload: document.querySelector("#reload-deck"),
  documentTitle: document.querySelector("#document-title"),
  documentPath: document.querySelector("#document-path"),
  connectionStatus: document.querySelector("#connection-status"),
  connectionLabel: document.querySelector("#connection-label"),
  saveState: document.querySelector("#save-state"),
  loadingCard: document.querySelector("#loading-card"),
  loadingTitle: document.querySelector("#loading-title"),
  loadingMessage: document.querySelector("#loading-message"),
  activityPanel: document.querySelector("#activity-panel"),
  activityList: document.querySelector("#activity-list"),
  toggleActivity: document.querySelector("#toggle-activity"),
  closeActivity: document.querySelector("#close-activity"),
  openDialog: document.querySelector("#open-dialog"),
  closeOpenDialog: document.querySelector("#close-open-dialog"),
  uploadDropzone: document.querySelector("#upload-dropzone"),
  chooseWritableFolder: document.querySelector("#choose-writable-folder"),
  uploadFolder: document.querySelector("#upload-folder"),
  deckDialog: document.querySelector("#deck-dialog"),
  deckOptions: document.querySelector("#deck-options"),
  folderFallback: document.querySelector("#folder-fallback"),
  toastRegion: document.querySelector("#toast-region"),
};

const state = {
  remote: null,
  connection: null,
  source: "demo",
  directoryHandle: null,
  fileIndex: new Map(),
  memoryFiles: new Map(),
  manifestPath: "presentation.pptd",
  manifestDirectory: "",
  manifestContent: "",
  deckTitle: "演示文稿",
  lastDeckPayload: null,
  saveQueue: Promise.resolve(),
  imageCache: new Map(),
  dragDepth: 0,
  readOnlyFallback: false,
};

function setConnection(kind, label) {
  elements.connectionStatus.className = `status-pill status-${kind}`;
  elements.connectionLabel.textContent = label;
  document.documentElement.dataset.connection = kind;
}

function setSaveState(label, kind = "idle") {
  elements.saveState.textContent = label;
  elements.saveState.dataset.kind = kind;
  document.documentElement.dataset.saveState = kind;
}

function setLoading(visible, title, message) {
  elements.loadingCard.classList.toggle("is-hidden", !visible);
  elements.loadingCard.setAttribute("aria-hidden", String(!visible));
  if (title) elements.loadingTitle.textContent = title;
  if (message) elements.loadingMessage.textContent = message;
}

function formatTime(date = new Date()) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function addActivity(message, tone = "info") {
  const item = document.createElement("li");
  item.dataset.tone = tone;
  item.innerHTML = `<time>${formatTime()}</time><span></span>`;
  item.querySelector("span").textContent = message;
  elements.activityList.prepend(item);
  while (elements.activityList.children.length > 40) {
    elements.activityList.lastElementChild.remove();
  }
}

function toast(message, tone = "info") {
  const item = document.createElement("div");
  item.className = `toast toast-${tone}`;
  item.textContent = message;
  elements.toastRegion.append(item);
  requestAnimationFrame(() => item.classList.add("is-visible"));
  setTimeout(() => {
    item.classList.remove("is-visible");
    setTimeout(() => item.remove(), 220);
  }, 3200);
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
      annotation: false,
      feedback: false,
      share: false,
      versionHistory: false,
    }),
    sdkSaveMode: "external",
    sdkImageMode: "external",
  });
}

function demoDeck() {
  const manifest = JSON.stringify({
    version: "v2",
    title: "NeoDeck Local",
    size: [960, 540],
    pages: ["pages/01.page", "pages/02.page"],
  });
  const pages = [
    {
      path: "pages/01.page",
      content: JSON.stringify({
        pageType: "content",
        background: { color: "#f7f8fc" },
        elements: [
          {
            elementId: "eyebrow",
            elementType: "text",
            bounds: [92, 96, 776, 40],
            content: {
              text: '<p><span style="font-size:16px;color:#6c5ce7;font-weight:700;letter-spacing:2px">NEODECK LOCAL</span></p>',
            },
          },
          {
            elementId: "title",
            elementType: "text",
            bounds: [92, 155, 776, 142],
            content: {
              text: '<p><span style="font-size:52px;color:#171923;font-weight:700">直接打开和保存<br/>本地 PPTD</span></p>',
            },
          },
          {
            elementId: "subtitle",
            elementType: "text",
            bounds: [94, 330, 660, 58],
            content: {
              text: '<p><span style="font-size:20px;color:#667085">第三方宿主 · 本地文件 · Kimi neo-ppt 编辑内核</span></p>',
            },
          },
        ],
        animations: [
          {
            elementId: "title",
            effect: "fade-in",
            trigger: "onClick",
            direction: "up",
            easing: "ease-in-out",
            durationMs: 700,
          },
        ],
      }),
    },
    {
      path: "pages/02.page",
      content: JSON.stringify({
        pageType: "content",
        background: { color: "#171923" },
        elements: [
          {
            elementId: "second-title",
            elementType: "text",
            bounds: [100, 120, 760, 96],
            content: {
              text: '<p><span style="font-size:42px;color:#ffffff;font-weight:700">文件系统桥接已经就绪</span></p>',
            },
          },
          {
            elementId: "steps",
            elementType: "text",
            bounds: [102, 250, 730, 165],
            content: {
              text: '<p><span style="font-size:22px;color:#cbd5e1">① 选择完整的 PPTD 项目文件夹</span></p><p><span style="font-size:22px;color:#cbd5e1">② 编辑器自动读取清单、页面与素材</span></p><p><span style="font-size:22px;color:#cbd5e1">③ 自动保存变更到原目录</span></p>',
            },
          },
        ],
      }),
    },
  ];
  return {
    id: "neodeck-demo",
    title: "NeoDeck Local",
    manifestPath: "presentation.pptd",
    manifestContent: manifest,
    pages,
    basePath: "",
    isCreate: true,
  };
}

function requireRemote() {
  if (!state.remote) throw new Error("编辑器还没有连接完成");
  return state.remote;
}

async function setDeck(payload, sourceLabel) {
  const remote = requireRemote();
  setLoading(true, "正在载入 PPTD", sourceLabel);
  state.lastDeckPayload = payload;
  state.manifestContent = payload.manifestContent;
  state.manifestPath = payload.manifestPath;
  state.manifestDirectory = dirname(payload.manifestPath);
  state.deckTitle = payload.title;
  elements.documentTitle.textContent = payload.title;
  elements.documentPath.textContent = sourceLabel;
  elements.reload.disabled = false;

  await remote.setPPTD(payload.id, {
    pptdContent: payload.manifestContent,
    pages: payload.pages,
    basePath: payload.basePath,
    pptdPath: payload.manifestPath,
    isCreate: true,
  });
  await remote.setEditable(true);
  const status = await remote.getSlideStatus();
  setLoading(false);
  addActivity(`已载入「${payload.title}」，共 ${payload.pages.length} 页`, "success");
  document.documentElement.dataset.deckStatus = "ready";
  window.dispatchEvent(new CustomEvent("neodeck:ready", { detail: status }));
}

async function openDemo() {
  state.source = "demo";
  state.directoryHandle = null;
  state.fileIndex.clear();
  state.imageCache.clear();
  state.memoryFiles.clear();
  state.readOnlyFallback = false;
  const payload = demoDeck();
  state.memoryFiles.set(payload.manifestPath, payload.manifestContent);
  for (const page of payload.pages) state.memoryFiles.set(page.path, page.content);
  await setDeck(payload, "内置示例 · 修改保存在本页内存");
  setSaveState("示例 · 内存保存", "memory");
}

async function indexDirectory(directoryHandle) {
  const index = new Map();
  async function walk(handle, prefix = "") {
    for await (const [name, entry] of handle.entries()) {
      if (name === ".DS_Store") continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (entry.kind === "directory") await walk(entry, path);
      else index.set(normalizeRelativePath(path), entry);
    }
  }
  await walk(directoryHandle);
  return index;
}

function indexFallbackFiles(fileList) {
  const index = new Map();
  const files = [...fileList];
  const firstPath = files[0]?.webkitRelativePath || files[0]?.name || "";
  const rootName = firstPath.includes("/") ? firstPath.split("/")[0] : "";
  for (const file of files) {
    let path = file.webkitRelativePath || file.name;
    if (rootName && path.startsWith(`${rootName}/`)) path = path.slice(rootName.length + 1);
    index.set(normalizeRelativePath(path), { kind: "file", getFile: async () => file });
  }
  return index;
}

async function chooseManifest(paths) {
  if (paths.length === 1) return paths[0];
  elements.deckOptions.replaceChildren();
  const choice = new Promise((resolve) => {
    for (const path of paths) {
      const button = document.createElement("button");
      button.className = "deck-option";
      button.type = "button";
      button.innerHTML = `<span class="deck-file-icon">P</span><span><strong></strong><small></small></span><span>›</span>`;
      button.querySelector("strong").textContent = basename(path);
      button.querySelector("small").textContent = path;
      button.addEventListener("click", () => {
        elements.deckDialog.close();
        resolve(path);
      });
      elements.deckOptions.append(button);
    }
    elements.deckDialog.addEventListener(
      "close",
      () => {
        if (elements.deckDialog.returnValue === "cancel") resolve(null);
      },
      { once: true },
    );
  });
  elements.deckDialog.showModal();
  return choice;
}

async function textFromIndexedFile(path) {
  const entry = state.fileIndex.get(normalizeRelativePath(path));
  if (!entry) throw new Error(`找不到文件：${path}`);
  const file = await entry.getFile();
  if (file.size > MAX_TEXT_BYTES) throw new Error(`文件超过 20 MiB：${path}`);
  return file.text();
}

async function loadManifest(manifestPath, sourceLabel) {
  const manifestContent = await textFromIndexedFile(manifestPath);
  const pagePaths = extractPagePaths(manifestContent);
  const manifestDirectory = dirname(manifestPath);
  const pages = [];
  const missing = [];
  for (const pagePath of pagePaths.slice(0, 500)) {
    const indexedPath = joinDeckPath(manifestDirectory, pagePath);
    try {
      pages.push({ path: pagePath, content: await textFromIndexedFile(indexedPath) });
    } catch {
      missing.push(pagePath);
    }
  }
  if (pages.length === 0) throw new Error(".pptd 清单引用的页面均无法读取");
  if (missing.length) toast(`跳过 ${missing.length} 个无法读取的页面`, "warning");

  const fallbackTitle = basename(manifestPath).replace(/\.pptd$/i, "");
  const title = titleFromManifest(manifestContent, fallbackTitle);
  await setDeck(
    {
      id: fallbackTitle,
      title,
      manifestPath,
      manifestContent,
      pages,
      basePath: manifestDirectory ? `${manifestDirectory}/` : "",
      isCreate: true,
    },
    sourceLabel,
  );
  setSaveState(state.readOnlyFallback ? "只读打开" : "自动保存已开启", state.readOnlyFallback ? "readonly" : "saved");
}

async function openDirectoryHandle(directoryHandle, label = directoryHandle.name) {
  setLoading(true, "正在扫描文件夹", label);
  let permission = await directoryHandle.queryPermission?.({ mode: "readwrite" });
  if (permission !== "granted") permission = await directoryHandle.requestPermission?.({ mode: "readwrite" });
  if (permission !== "granted") throw new Error("没有获得文件夹读写权限");

  state.source = "directory";
  state.directoryHandle = directoryHandle;
  state.readOnlyFallback = false;
  state.fileIndex = await indexDirectory(directoryHandle);
  state.imageCache.clear();
  const manifests = [...state.fileIndex.keys()].filter((path) => path.toLowerCase().endsWith(".pptd"));
  if (manifests.length === 0) throw new Error("文件夹里没有找到 .pptd 清单文件");
  const manifestPath = await chooseManifest(manifests.sort());
  if (!manifestPath) {
    setLoading(false);
    return;
  }
  await loadManifest(manifestPath, `${label}/${manifestPath}`);
}

async function openFallbackFiles(files) {
  state.source = "fallback";
  state.directoryHandle = null;
  state.readOnlyFallback = true;
  state.fileIndex = indexFallbackFiles(files);
  state.imageCache.clear();
  const manifests = [...state.fileIndex.keys()].filter((path) => path.toLowerCase().endsWith(".pptd"));
  if (manifests.length === 0) throw new Error("文件夹里没有找到 .pptd 清单文件");
  const manifestPath = await chooseManifest(manifests.sort());
  if (manifestPath) await loadManifest(manifestPath, `${manifestPath} · 只读兼容模式`);
}

async function openDirectoryHandleReadOnly(directoryHandle, label = directoryHandle.name) {
  setLoading(true, "正在扫描文件夹", label);
  state.source = "fallback";
  state.directoryHandle = null;
  state.readOnlyFallback = true;
  state.fileIndex = await indexDirectory(directoryHandle);
  state.imageCache.clear();
  const manifests = [...state.fileIndex.keys()].filter((path) => path.toLowerCase().endsWith(".pptd"));
  if (manifests.length === 0) throw new Error("文件夹里没有找到 .pptd 清单文件");
  const manifestPath = await chooseManifest(manifests.sort());
  if (manifestPath) await loadManifest(manifestPath, `${label}/${manifestPath} · 拖放只读模式`);
}

async function pickDirectory() {
  try {
    if ("showDirectoryPicker" in window) {
      const directoryHandle = await window.showDirectoryPicker({ id: "neodeck-project", mode: "readwrite" });
      setOpenDialog(false);
      await openDirectoryHandle(directoryHandle);
    } else {
      elements.folderFallback.click();
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
    handleError(error, "打开文件夹失败");
  }
}

async function openDroppedFolder(handles) {
  const usableHandles = handles.filter(Boolean);
  if (usableHandles.length !== 1 || usableHandles[0].kind !== "directory") {
    throw new Error("只能拖入一个完整的 PPTD 项目文件夹，不能单独拖入 .pptd 文件");
  }

  const directoryHandle = usableHandles[0];
  try {
    setOpenDialog(false);
    await openDirectoryHandle(directoryHandle);
  } catch (error) {
    setOpenDialog(false);
    toast("无法以可写模式载入，正在尝试只读打开", "warning");
    await openDirectoryHandleReadOnly(directoryHandle);
  }
}

function resolveIndexedPath(requestedPath) {
  if (typeof requestedPath !== "string" || !requestedPath.trim()) return null;
  if (/^(?:data:image\/|https?:\/\/|blob:)/i.test(requestedPath)) return requestedPath;
  let candidate = requestedPath.replace(/^file:\/\/+/, "").replaceAll("\\", "/");
  try {
    candidate = decodeURIComponent(candidate);
  } catch {
    // Preserve literal percent signs.
  }

  const directCandidates = [];
  try {
    directCandidates.push(normalizeRelativePath(candidate));
  } catch {
    const parts = candidate.split("/").filter(Boolean);
    for (let index = 0; index < parts.length; index += 1) {
      try {
        directCandidates.push(normalizeRelativePath(parts.slice(index).join("/")));
      } catch {
        // Keep looking for a safe suffix.
      }
    }
  }
  try {
    directCandidates.push(joinDeckPath(state.manifestDirectory, candidate));
  } catch {
    // Absolute paths may still match a safe indexed suffix below.
  }
  for (const path of directCandidates) if (state.fileIndex.has(path)) return path;
  for (const path of state.fileIndex.keys()) {
    if (directCandidates.some((candidatePath) => path.endsWith(`/${candidatePath}`) || path === candidatePath)) return path;
  }
  return null;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error || new Error("图片读取失败")));
    reader.readAsDataURL(file);
  });
}

async function resolveImage(requestedPath) {
  if (/^(?:data:image\/|https?:\/\/|blob:)/i.test(requestedPath)) return requestedPath;
  const path = resolveIndexedPath(requestedPath);
  if (!path) return "";
  const entry = state.fileIndex.get(path);
  const file = await entry.getFile();
  if (file.size > MAX_IMAGE_BYTES) return "";
  const cacheKey = `${path}:${file.lastModified}:${file.size}`;
  if (!state.imageCache.has(cacheKey)) state.imageCache.set(cacheKey, fileToDataUrl(file));
  return state.imageCache.get(cacheKey);
}

async function getImages(payload = {}) {
  const paths = Array.isArray(payload.filePath) ? payload.filePath : [];
  const result = await Promise.all(paths.map((path) => resolveImage(path).catch(() => "")));
  const misses = result.filter((value) => !value).length;
  if (misses) addActivity(`${paths.length} 张图片中有 ${misses} 张未找到`, "warning");
  return result;
}

async function getHandleForPath(root, path, create = false) {
  const parts = normalizeRelativePath(path).split("/");
  const fileName = parts.pop();
  let directory = root;
  for (const part of parts) directory = await directory.getDirectoryHandle(part, { create });
  return { directory, fileName, file: await directory.getFileHandle(fileName, { create }) };
}

async function readBackup(path) {
  try {
    const { file } = await getHandleForPath(state.directoryHandle, path, false);
    return { existed: true, bytes: await (await file.getFile()).arrayBuffer() };
  } catch (error) {
    if (error?.name === "NotFoundError") return { existed: false, bytes: null };
    throw error;
  }
}

async function writeFile(path, content) {
  const { file } = await getHandleForPath(state.directoryHandle, path, true);
  const writable = await file.createWritable();
  try {
    await writable.write(content);
  } finally {
    await writable.close();
  }
  state.fileIndex.set(path, file);
}

async function deleteFile(path) {
  const parts = normalizeRelativePath(path).split("/");
  const fileName = parts.pop();
  let directory = state.directoryHandle;
  for (const part of parts) directory = await directory.getDirectoryHandle(part, { create: false });
  try {
    await directory.removeEntry(fileName);
  } catch (error) {
    if (error?.name !== "NotFoundError") throw error;
  }
  state.fileIndex.delete(path);
}

async function rollbackChanges(backups) {
  const entries = [...backups.entries()].reverse();
  for (const [path, backup] of entries) {
    if (backup.existed) await writeFile(path, backup.bytes);
    else await deleteFile(path);
  }
}

async function persistChanges(payload = {}) {
  const changes = Array.isArray(payload.changes) ? payload.changes : [];
  if (changes.length === 0) return { fileContent: payload.fileContent, lastModifiedTime: Date.now() };
  if (changes.length > MAX_CHANGE_COUNT) throw new Error(`一次保存不能超过 ${MAX_CHANGE_COUNT} 个文件`);

  const normalized = changes.map((change) => {
    const path = assertWritableChangePath(state.manifestDirectory, change.path);
    const operation = change.operate === "delete" ? "delete" : "put";
    const content = operation === "put" ? String(change.content ?? "") : null;
    if (content && new Blob([content]).size > MAX_TEXT_BYTES) throw new Error(`保存内容超过 20 MiB：${path}`);
    return { path, operation, content };
  });

  if (state.source === "demo") {
    for (const change of normalized) {
      if (change.operation === "delete") state.memoryFiles.delete(change.path);
      else state.memoryFiles.set(change.path, change.content);
    }
    setSaveState("刚刚保存到内存", "memory");
    addActivity(`已在内存保存 ${normalized.length} 项变更`, "success");
    return { fileContent: payload.fileContent, lastModifiedTime: Date.now() };
  }

  if (state.readOnlyFallback || !state.directoryHandle) {
    throw new Error("当前是只读兼容模式，请用支持文件夹授权的 Chromium 浏览器打开");
  }

  const permission = await state.directoryHandle.queryPermission({ mode: "readwrite" });
  if (permission !== "granted") throw new Error("项目文件夹的写入权限已经失效");

  setSaveState("正在保存…", "saving");
  const backups = new Map();
  try {
    for (const change of normalized) backups.set(change.path, await readBackup(change.path));
    for (const change of normalized) {
      if (change.operation === "delete") await deleteFile(change.path);
      else await writeFile(change.path, change.content);
    }
  } catch (error) {
    await rollbackChanges(backups).catch((rollbackError) => {
      addActivity(`回滚未完全成功：${rollbackError.message}`, "error");
    });
    throw error;
  }

  setSaveState("刚刚已保存", "saved");
  addActivity(`已保存 ${normalized.length} 个文件变更`, "success");
  return { fileContent: payload.fileContent, lastModifiedTime: Date.now() };
}

function onSave(payload) {
  const operation = state.saveQueue.then(() => persistChanges(payload));
  state.saveQueue = operation.catch(() => undefined);
  return operation.catch((error) => {
    setSaveState("保存失败", "error");
    addActivity(error.message, "error");
    toast(`保存失败：${error.message}`, "error");
    throw error;
  });
}

async function toggleFullscreen(value) {
  if (value === false || document.fullscreenElement) {
    if (document.fullscreenElement) await document.exitFullscreen();
    return false;
  }
  await document.documentElement.requestFullscreen();
  return true;
}

function handleError(error, context = "操作失败") {
  const message = error?.message || String(error);
  setLoading(false);
  addActivity(`${context}：${message}`, "error");
  toast(`${context}：${message}`, "error");
  console.error(context, error);
}

async function connectEditor() {
  setConnection("connecting", "连接中");
  addActivity("正在连接公开 neo-ppt 编辑器");
  elements.frame.src = `${EDITOR_ORIGIN}/neo-ppt/?${editorQuery()}`;

  try {
    const [{ i: connect, r: WindowMessenger }] = await Promise.all([
      import(PENPAL_MODULE),
      new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("编辑器 iframe 加载超时")), 20_000);
        elements.frame.addEventListener(
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
      remoteWindow: elements.frame.contentWindow,
      allowedOrigins: [EDITOR_ORIGIN],
    });
    state.connection = connect({
      messenger,
      methods: {
        close() {
          toast("当前文稿由 NeoDeck Local 托管");
        },
        reenter() {
          return state.lastDeckPayload ? setDeck(state.lastDeckPayload, elements.documentPath.textContent) : undefined;
        },
        toggleFullScreen: toggleFullscreen,
        showFeedback() {},
        sendPrompt() {
          toast("AI 提示词回传尚未接入", "warning");
        },
        showMessage(payload) {
          const message = typeof payload === "string" ? payload : payload?.message || payload?.content;
          if (message) toast(message);
        },
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
      new Promise((_, reject) => setTimeout(() => reject(new Error("RPC 握手超时")), 20_000)),
    ]);
    await state.remote.setSlideConfig({ editable: true, locale: "zh-CN", theme: "light" });
    setConnection("ready", "已连接");
    addActivity("编辑器 RPC 握手完成", "success");
    await openDemo();
  } catch (error) {
    setConnection("error", "连接失败");
    setLoading(true, "无法连接编辑器", "请检查网络，或 Kimi 是否更新了公开前端资源。");
    handleError(error, "编辑器连接失败");
  }
}

function setActivityPanel(open) {
  elements.activityPanel.classList.toggle("is-open", open);
  elements.activityPanel.setAttribute("aria-hidden", String(!open));
}

function setOpenDialog(open) {
  if (open && !elements.openDialog.open) elements.openDialog.showModal();
  if (!open && elements.openDialog.open) elements.openDialog.close();
  elements.openDialog.dataset.dropState = "idle";
  elements.uploadDropzone.classList.remove("is-dragging");
}

elements.openFolder.addEventListener("click", () => setOpenDialog(true));
elements.closeOpenDialog.addEventListener("click", () => setOpenDialog(false));
elements.chooseWritableFolder.addEventListener("click", pickDirectory);
elements.uploadFolder.addEventListener("click", () => elements.folderFallback.click());
elements.uploadDropzone.addEventListener("click", () => elements.folderFallback.click());
elements.openDialog.addEventListener("click", (event) => {
  if (event.target === elements.openDialog) setOpenDialog(false);
});
elements.openDemo.addEventListener("click", () => openDemo().catch((error) => handleError(error, "示例载入失败")));
elements.reload.addEventListener("click", () => {
  if (!state.lastDeckPayload) return;
  const reload = state.source === "directory" ? loadManifest(state.manifestPath, elements.documentPath.textContent) : setDeck(state.lastDeckPayload, elements.documentPath.textContent);
  reload.catch((error) => handleError(error, "重新载入失败"));
});
elements.toggleActivity.addEventListener("click", () => setActivityPanel(!elements.activityPanel.classList.contains("is-open")));
elements.closeActivity.addEventListener("click", () => setActivityPanel(false));
elements.folderFallback.addEventListener("change", () => {
  if (elements.folderFallback.files?.length) {
    setOpenDialog(false);
    openFallbackFiles(elements.folderFallback.files).catch((error) => handleError(error, "上传文件夹失败"));
  }
  elements.folderFallback.value = "";
});

window.addEventListener("dragenter", (event) => {
  event.preventDefault();
  state.dragDepth += 1;
  setOpenDialog(true);
  elements.openDialog.dataset.dropState = "active";
  elements.uploadDropzone.classList.add("is-dragging");
});
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("dragleave", () => {
  state.dragDepth = Math.max(0, state.dragDepth - 1);
  if (state.dragDepth === 0) {
    elements.openDialog.dataset.dropState = "idle";
    elements.uploadDropzone.classList.remove("is-dragging");
  }
});
window.addEventListener("drop", async (event) => {
  event.preventDefault();
  state.dragDepth = 0;
  elements.openDialog.dataset.dropState = "loading";
  elements.uploadDropzone.classList.remove("is-dragging");
  try {
    const handles = await Promise.all([...event.dataTransfer.items].map((item) => item.getAsFileSystemHandle?.()));
    if (handles.some(Boolean)) await openDroppedFolder(handles);
    else if (event.dataTransfer.files?.length) {
      const files = [...event.dataTransfer.files];
      const roots = new Set(files.map((file) => file.webkitRelativePath?.split("/")[0]).filter(Boolean));
      const isSingleFolder = files.length > 0 && roots.size === 1 && files.every((file) => file.webkitRelativePath?.includes("/"));
      if (!isSingleFolder) throw new Error("只能拖入一个完整的 PPTD 项目文件夹，不能单独拖入 .pptd 文件");
      setOpenDialog(false);
      await openFallbackFiles(files);
    } else throw new Error("请拖入包含 .pptd、pages 和 media 的完整项目文件夹");
  } catch (error) {
    handleError(error, "拖放打开失败");
  } finally {
    elements.openDialog.dataset.dropState = "idle";
  }
});

window.addEventListener("beforeunload", (event) => {
  if (elements.saveState.dataset.kind === "saving") {
    event.preventDefault();
    event.returnValue = "";
  }
});

window.neoDeck = {
  openDemo,
  getSlideStatus: () => state.remote?.getSlideStatus(),
  get status() {
    return {
      connected: Boolean(state.remote),
      source: state.source,
      title: state.deckTitle,
      manifestPath: state.manifestPath,
      indexedFiles: state.fileIndex.size,
      saveState: elements.saveState.dataset.kind,
    };
  },
};

connectEditor();
