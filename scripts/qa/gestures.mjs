/**
 * Interaction QA gesture toolbox — real event streams only.
 * See docs/agents/interaction-qa.md. Tests must import these primitives
 * instead of synthesizing drag/type/color sequences themselves.
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = process.env.BASE || "http://127.0.0.1:55200";
const SERVER_JS = path.join(ROOT, "apps/native-web/src/server.mjs");
const FIXTURES_DIR = path.join(ROOT, "fixtures");
let fixtureSnapshotRoot = "";
let fixtureSnapshotDir = "";
let fixtureSnapshotDigest = "";

function assertFixturePath(target) {
  const resolved = path.resolve(target);
  if (resolved !== FIXTURES_DIR && !resolved.startsWith(`${FIXTURES_DIR}${path.sep}`)) {
    throw new Error(`refusing to mutate path outside fixtures: ${resolved}`);
  }
}

function treeManifest(root) {
  const rows = new Map();
  if (!fs.existsSync(root)) return rows;
  const walk = (dir, prefix = "") => {
    for (const name of fs.readdirSync(dir).sort()) {
      const abs = path.join(dir, name);
      const rel = prefix ? path.join(prefix, name) : name;
      const stat = fs.lstatSync(abs);
      const kind = stat.isDirectory() ? "dir" : stat.isSymbolicLink() ? "link" : "file";
      rows.set(rel, kind);
      if (kind === "dir") walk(abs, rel);
    }
  };
  walk(root);
  return rows;
}

function treeDigest(root) {
  const hash = crypto.createHash("sha256");
  for (const [rel, kind] of treeManifest(root)) {
    const abs = path.join(root, rel);
    hash.update(`${kind}\0${rel}\0`);
    if (kind === "file") hash.update(fs.readFileSync(abs));
    if (kind === "link") hash.update(fs.readlinkSync(abs));
  }
  return hash.digest("hex");
}

function captureFixtureSnapshot() {
  if (fixtureSnapshotDir) return;
  fixtureSnapshotRoot = fs.mkdtempSync(path.join(os.tmpdir(), "open-slidestudio-fixtures-"));
  fixtureSnapshotDir = path.join(fixtureSnapshotRoot, "fixtures");
  if (fs.existsSync(FIXTURES_DIR)) {
    fs.cpSync(FIXTURES_DIR, fixtureSnapshotDir, { recursive: true, preserveTimestamps: true });
  } else {
    fs.mkdirSync(fixtureSnapshotDir, { recursive: true });
  }
  fixtureSnapshotDigest = treeDigest(fixtureSnapshotDir);
}

function restoreFixtureSnapshot() {
  captureFixtureSnapshot();
  assertFixturePath(FIXTURES_DIR);
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  const wanted = treeManifest(fixtureSnapshotDir);
  const current = [...treeManifest(FIXTURES_DIR)].sort(
    ([a], [b]) => b.split(path.sep).length - a.split(path.sep).length,
  );
  for (const [rel, kind] of current) {
    if (wanted.get(rel) === kind) continue;
    const target = path.join(FIXTURES_DIR, rel);
    assertFixturePath(target);
    fs.rmSync(target, { recursive: true, force: true });
  }
  fs.cpSync(fixtureSnapshotDir, FIXTURES_DIR, { recursive: true, force: true, preserveTimestamps: true });
}

process.once("exit", () => {
  if (!fixtureSnapshotDir) return;
  try {
    restoreFixtureSnapshot();
  } catch {
    /* best effort during process shutdown */
  }
  try {
    fs.rmSync(fixtureSnapshotRoot, { recursive: true, force: true });
  } catch {
    /* temp snapshot is harmless if shutdown cleanup is interrupted */
  }
});

function platformMod() {
  return process.platform === "darwin" ? "Meta" : "Control";
}

/**
 * Read #slide's current CSS scale (same pattern as app.js slideScale()).
 * @param {import("playwright").Page} page
 */
export async function readSlideScale(page) {
  return page.evaluate(() => {
    const slide = document.getElementById("slide");
    const t = slide?.style.transform || "";
    const m = /scale\(([^)]+)\)/.exec(t);
    return m ? Number(m[1]) : 1;
  });
}

/**
 * Convert slide-local coordinates to viewport/client pixels through the current scale.
 * @param {import("playwright").Page} page
 * @param {number} x
 * @param {number} y
 */
export async function slideToClient(page, x, y) {
  return page.evaluate(
    ([sx, sy]) => {
      const slide = document.getElementById("slide");
      if (!slide) throw new Error("#slide missing");
      const t = slide.style.transform || "";
      const m = /scale\(([^)]+)\)/.exec(t);
      const scale = m ? Number(m[1]) : 1;
      const r = slide.getBoundingClientRect();
      return { x: r.left + sx * scale, y: r.top + sy * scale, scale };
    },
    [x, y],
  );
}

/**
 * Slide-local center of `.el[data-id]`.
 * @param {import("playwright").Page} page
 * @param {string} id
 */
export async function elSlideCenter(page, id) {
  const pt = await page.evaluate((elId) => {
    const node = document.querySelector(`#slide .el[data-id="${elId}"]`);
    if (!node) return null;
    const left = parseFloat(node.style.left) || 0;
    const top = parseFloat(node.style.top) || 0;
    const w = parseFloat(node.style.width) || node.offsetWidth;
    const h = parseFloat(node.style.height) || node.offsetHeight;
    return { x: left + w / 2, y: top + h / 2 };
  }, id);
  if (!pt) throw new Error(`element ${id} not on #slide`);
  return pt;
}

/**
 * Viewport center of an element node.
 * @param {import("playwright").Page} page
 * @param {string} id
 */
export async function elClientCenter(page, id) {
  const local = await elSlideCenter(page, id);
  return slideToClient(page, local.x, local.y);
}

async function waitEditorReady(page) {
  await page.waitForFunction(
    () => {
      const t = document.getElementById("doc-title")?.textContent || "";
      return t && t !== "未加载";
    },
    null,
    { timeout: 20000 },
  );
  await page.waitForSelector("#slide", { timeout: 15000 });
  // The workspace cover lifts once the editor layout is stable; input waits for it.
  await page.waitForSelector("#workspace-cover", { state: "hidden", timeout: 15000 }).catch(() => {});
}

/**
 * User opens a project in the native editor and waits until the chrome is ready.
 * @param {import("playwright").Page} page
 * @param {string} project
 */
export async function openEditor(page, project) {
  const url = `${BASE}/index.html?project=${encodeURIComponent(project)}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await waitEditorReady(page);
}

/**
 * User clicks a chrome / toolbar control (real mouse down/up at its center).
 * @param {import("playwright").Page} page
 * @param {string} selector
 * @param {{ text?: string, timeout?: number }} [opts]
 */
export async function clickUi(page, selector, opts = {}) {
  const loc = opts.text
    ? opts.exact
      ? page
          .locator(selector)
          .filter({ hasText: new RegExp(`^${String(opts.text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) })
          .first()
      : page.locator(selector, { hasText: opts.text }).first()
    : page.locator(selector).first();
  await loc.waitFor({ state: "attached", timeout: opts.timeout ?? 8000 });
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  const box = await loc.boundingBox();
  if (!box) throw new Error(`clickUi: no box for ${selector}${opts.text ? ` "${opts.text}"` : ""}`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/**
 * Official table insert: open the size picker, then choose rows × cols.
 * @param {import("playwright").Page} page
 * @param {number} [rows]
 * @param {number} [cols]
 */
export async function pickTableSize(page, rows = 2, cols = 2) {
  await page.locator("#table-size:not([hidden])").waitFor({ timeout: 4000 });
  await clickUi(page, `.table-size-cell[data-r="${rows}"][data-c="${cols}"]`);
}

/**
 * Seed an element through the command API instead of the insert toolbar.
 *
 * The editor keeps manual affordances for text / shape / image / table (plus the
 * shape palette's line tab) only. Chart, icon and SmartArt insertion were
 * retired with the bottom bar by design: decks get those elements from the
 * agent, and hand-editing belongs in PowerPoint. A suite that still needs one
 * seeds it here and reloads, because an API write is not observed by the open
 * page.
 *
 * @param {import("playwright").Page} page
 * @param {string} kind insert kind, e.g. "chart"
 * @returns {Promise<{status:number, error:null|string, model:object|null}>} the
 *   command response's model, so callers can select exactly what was seeded
 *   (SmartArt, for example, seeds a group of shapes and text runs).
 */
export async function insertViaCommand(page, kind) {
  const result = await page.evaluate(async (wanted) => {
    const project = new URLSearchParams(location.search).get("project") || "";
    const res = await fetch(`/api/command?project=${encodeURIComponent(project)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cmd: "insert", kind: wanted }),
    });
    const data = await res.json();
    return { status: res.status, error: data.error ?? null, model: data.model ?? null };
  }, kind);
  if (result.status !== 200 || result.error) {
    throw new Error(`insert ${kind} via command failed: ${result.error || result.status}`);
  }
  await page.reload({ waitUntil: "networkidle" });
  await waitEditorReady(page);
  return result;
}

/**
 * User clicks empty slide canvas at slide-local (x, y) — commit edit / deselect / close overlay.
 * @param {import("playwright").Page} page
 * @param {number} x
 * @param {number} y
 */
export async function clickSlide(page, x, y) {
  const pt = await slideToClient(page, x, y);
  await page.mouse.click(pt.x, pt.y);
}

/**
 * User single-clicks an element to select it (or drop a comment pin when the layer is up).
 * @param {import("playwright").Page} page
 * @param {string} id
 */
export async function clickEl(page, id) {
  await page.waitForSelector(`#slide .el[data-id="${id}"]`, { timeout: 8000 });
  const pt = await elClientCenter(page, id);
  await page.mouse.click(pt.x, pt.y);
}

/**
 * User double-clicks an element (text → inline edit) with real dblclick timing at its center.
 * @param {import("playwright").Page} page
 * @param {string} id
 */
export async function dblclickEl(page, id) {
  await page.waitForSelector(`#slide .el[data-id="${id}"]`, { timeout: 8000 });
  const pt = await elClientCenter(page, id);
  await page.mouse.dblclick(pt.x, pt.y);
}

async function cellClientCenter(page, id, row, col) {
  const box = await page.evaluate(
    ({ elId, row: r, col: c }) => {
      const table = document.querySelector(`#slide .el[data-id="${elId}"] table`);
      const td = table?.rows?.[r]?.cells?.[c];
      if (!td) return null;
      const b = td.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    },
    { elId: id, row, col },
  );
  if (!box) throw new Error(`table cell ${row},${col} missing on ${id}`);
  return box;
}

/**
 * User single-clicks a table cell (selects the table + that cell).
 * @param {import("playwright").Page} page
 * @param {string} id
 * @param {number} row
 * @param {number} col
 */
export async function clickCell(page, id, row, col) {
  const box = await cellClientCenter(page, id, row, col);
  await page.mouse.click(box.x, box.y);
}

/**
 * User double-clicks table cell (row, col) to type into it.
 * @param {import("playwright").Page} page
 * @param {string} id
 * @param {number} row
 * @param {number} col
 */
export async function dblclickCell(page, id, row, col) {
  const box = await cellClientCenter(page, id, row, col);
  await page.mouse.dblclick(box.x, box.y);
}

/**
 * User presses on an element and drags it by (dx, dy) slide-local pixels
 * (pointerdown → ≥8 pointermove steps → pointerup, scale-converted).
 * @param {import("playwright").Page} page
 * @param {string} id
 * @param {number} dx
 * @param {number} dy
 * @param {{ steps?: number, onMid?: () => Promise<void> }} [opts]
 */
export async function dragEl(page, id, dx, dy, opts = {}) {
  await page.waitForSelector(`#slide .el[data-id="${id}"]`, { timeout: 8000 });
  const startLocal = await elSlideCenter(page, id);
  const start = await slideToClient(page, startLocal.x, startLocal.y);
  const end = await slideToClient(page, startLocal.x + dx, startLocal.y + dy);
  const steps = Math.max(8, opts.steps ?? 12);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  if (opts.onMid) {
    const midSteps = Math.max(8, Math.floor(steps / 2));
    await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: midSteps });
    await opts.onMid();
    await page.mouse.move(end.x, end.y, { steps: Math.max(8, steps - midSteps) });
  } else {
    await page.mouse.move(end.x, end.y, { steps });
  }
  await page.mouse.up();
}

/**
 * User drags an eight-way resize handle or the `rot` rotate handle.
 * @param {import("playwright").Page} page
 * @param {string} id
 * @param {string} dir
 * @param {number} dx
 * @param {number} dy
 */
export async function dragHandle(page, id, dir, dx, dy) {
  const sel =
    dir === "rot"
      ? `#slide .el[data-id="${id}"] .handle-rot`
      : `#slide .el[data-id="${id}"] .handle-${dir}`;
  const handle = page.locator(sel).first();
  await handle.waitFor({ state: "attached", timeout: 8000 });
  const box = await handle.boundingBox();
  if (!box) throw new Error(`dragHandle: no box for ${dir} on ${id}`);
  const scale = await readSlideScale(page);
  const sx = box.x + box.width / 2;
  const sy = box.y + box.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + dx * scale, sy + dy * scale, { steps: 10 });
  await page.mouse.up();
}

/**
 * User drags an on-canvas crop handle (only present in crop mode).
 * @param {import("playwright").Page} page
 * @param {string} id
 * @param {string} dir
 * @param {number} dx
 * @param {number} dy
 * @param {{ onMid?: () => Promise<void> }} [opts]
 */
export async function dragCropHandle(page, id, dir, dx, dy, opts = {}) {
  const handle = page.locator(`#slide .el[data-id="${id}"] .handle-crop.handle-${dir}`).first();
  await handle.waitFor({ state: "attached", timeout: 8000 });
  const box = await handle.boundingBox();
  if (!box) throw new Error(`dragCropHandle: no box for ${dir} on ${id}`);
  const scale = await readSlideScale(page);
  const sx = box.x + box.width / 2;
  const sy = box.y + box.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  if (opts.onMid) {
    await page.mouse.move(sx + (dx * scale) / 2, sy + (dy * scale) / 2, { steps: 8 });
    await opts.onMid();
    await page.mouse.move(sx + dx * scale, sy + dy * scale, { steps: 8 });
  } else {
    await page.mouse.move(sx + dx * scale, sy + dy * scale, { steps: 10 });
  }
  await page.mouse.up();
}

/**
 * User drags a yellow shape-adjustment diamond.
 * @param {import("playwright").Page} page
 * @param {string} id
 * @param {number} index
 * @param {number} dx
 * @param {number} dy
 * @param {{ onMid?: () => Promise<void> }} [opts]
 */
export async function dragAdjHandle(page, id, index, dx, dy, opts = {}) {
  const handle = page.locator(`#slide .el[data-id="${id}"] [data-handle="adj:${index}"]`).first();
  await handle.waitFor({ state: "attached", timeout: 8000 });
  const box = await handle.boundingBox();
  if (!box) throw new Error(`dragAdjHandle: no box for adj:${index} on ${id}`);
  const scale = await readSlideScale(page);
  const sx = box.x + box.width / 2;
  const sy = box.y + box.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  if (opts.onMid) {
    await page.mouse.move(sx + (dx * scale) / 2, sy + (dy * scale) / 2, { steps: 8 });
    await opts.onMid();
    await page.mouse.move(sx + dx * scale, sy + dy * scale, { steps: 8 });
  } else {
    await page.mouse.move(sx + dx * scale, sy + dy * scale, { steps: 10 });
  }
  await page.mouse.up();
}

/**
 * User sets a range/number control. Fires input (live preview) then change (persist).
 * @param {import("playwright").Page} page
 * @param {string} selector
 * @param {number|string} value
 */
export async function setRange(page, selector, value) {
  const ok = await page.evaluate(
    ({ selector: sel, value: next }) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      el.value = String(next);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    { selector, value },
  );
  if (!ok) throw new Error(`setRange: missing ${selector}`);
}

/**
 * User inserts an image through the file picker (real filechooser + setFiles).
 * @param {import("playwright").Page} page
 * @param {string} filePath
 */
export async function chooseImageFile(page, filePath) {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser", { timeout: 8000 }),
    clickUi(page, '[data-control="insert.image"]'),
  ]);
  await chooser.setFiles(filePath);
}

/**
 * User rubber-band marquees from empty canvas (x0,y0) to (x1,y1) in slide-local space.
 * @param {import("playwright").Page} page
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 */
export async function marquee(page, x0, y0, x1, y1) {
  const from = await slideToClient(page, x0, y0);
  const to = await slideToClient(page, x1, y1);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

/**
 * User types into the current edit field (contenteditable / input / textarea) key-by-key.
 * @param {import("playwright").Page} page
 * @param {string} text
 */
export async function typeInto(page, text) {
  await page.keyboard.type(text, { delay: 25 });
}

/**
 * User presses a keyboard shortcut. Cmd/Command → Meta on macOS, otherwise Control
 * (headless Linux = Control). Control/Ctrl also map to the platform modifier.
 * @param {import("playwright").Page} page
 * @param {string} combo
 */
export async function shortcut(page, combo) {
  const mod = platformMod();
  const parts = String(combo)
    .split("+")
    .map((raw) => {
      const p = raw.trim();
      if (/^(cmd|command|meta)$/i.test(p)) return mod;
      if (/^(ctrl|control)$/i.test(p)) return mod;
      if (/^shift$/i.test(p)) return "Shift";
      if (/^(alt|option)$/i.test(p)) return "Alt";
      return p.length === 1 ? p.toLowerCase() : p;
    });
  await page.keyboard.press(parts.join("+"));
}

/**
 * User picks a hex color. Headless cannot open the OS color picker, so this is
 * the only allowed synthetic point: set value, then fire bubbling input + change
 * (input = live preview, change = persist).
 * @param {import("playwright").Page} page
 * @param {string} selector
 * @param {string} hex
 */
export async function pickColor(page, selector, hex) {
  const ok = await page.evaluate(
    ({ selector: sel, hex: value }) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    { selector, hex },
  );
  if (!ok) throw new Error(`pickColor: missing ${selector}`);
}

/**
 * User pastes from the clipboard: ClipboardEvent("paste") with DataTransfer text/plain
 * dispatched at the focused (or editing) target.
 * @param {import("playwright").Page} page
 * @param {string} text
 */
export async function pasteText(page, text) {
  await page.evaluate((value) => {
    const target =
      document.activeElement && document.activeElement !== document.body
        ? document.activeElement
        : document.querySelector("#slide .el.is-editing") ||
          document.querySelector(".pin-card textarea") ||
          document.body;
    const dt = new DataTransfer();
    dt.setData("text/plain", value);
    dt.setData("text", value);
    let ev;
    try {
      ev = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      });
    } catch {
      ev = new Event("paste", { bubbles: true, cancelable: true });
    }
    if (!ev.clipboardData) {
      Object.defineProperty(ev, "clipboardData", { value: dt });
    }
    target.dispatchEvent(ev);
  }, text);
}

/**
 * User right-clicks an element to open its context menu.
 * @param {import("playwright").Page} page
 * @param {string} id
 */
export async function openContextMenu(page, id) {
  await page.waitForSelector(`#slide .el[data-id="${id}"]`, { timeout: 8000 });
  const pt = await elClientCenter(page, id);
  await page.mouse.click(pt.x, pt.y, { button: "right" });
}

/**
 * Read the live document model (GET /api/model). Assertion/setup only — not a user gesture.
 * @param {import("playwright").Page} page
 */
export async function readModel(page) {
  try {
    const res = await page.request.get(`${BASE}/api/model`);
    if (res.ok()) return res.json();
  } catch {
    /* fall through to in-page fetch */
  }
  return page.evaluate(async () => {
    const res = await fetch("/api/model");
    return res.json();
  });
}

/**
 * User reloads the editor; the provided assertion must still hold (persistence).
 * @param {import("playwright").Page} page
 * @param {(page: import("playwright").Page) => Promise<void>} fn
 */
export async function assertPersisted(page, fn) {
  await page.reload({ waitUntil: "networkidle" });
  await waitEditorReady(page);
  await fn(page);
}

/**
 * Poll GET /api/health until the native-web server answers.
 * @param {number} [ms]
 */
export async function waitHealth(ms = 20000) {
  const deadline = Date.now() + ms;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
      last = `${r.status}`;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`native-web not healthy at ${BASE}/api/health (${last})`);
}

/**
 * Reuse a server owned by this checkout, or start one on BASE's port.
 * Never kills another checkout's process.
 */
export async function restartNativeWebServer() {
  try {
    const current = await fetch(`${BASE}/api/health`).then((response) =>
      response.ok ? response.json() : undefined,
    );
    if (current) {
      const checkoutRoot =
        typeof current.checkoutRoot === "string" ? path.resolve(current.checkoutRoot) : "";
      const legacyProject = typeof current.project === "string" ? current.project : "";
      if (checkoutRoot === ROOT) return;
      if (!checkoutRoot && legacyProject.startsWith(ROOT + path.sep)) return;
      throw new Error(
        `QA port ${new URL(BASE).port || "80"} belongs to another checkout (${checkoutRoot || legacyProject || "unknown"}); set BASE to a free port`,
      );
    }
  } catch (error) {
    if (error instanceof Error && /belongs to another checkout/.test(error.message)) throw error;
  }
  const port = new URL(BASE).port || "80";
  const log = `/tmp/open-slidestudio-native-web-${port}.log`;
  const child = spawn(process.execPath, [SERVER_JS], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", fs.openSync(log, "a"), fs.openSync(log, "a")],
    env: { ...process.env, PORT: port },
  });
  child.unref();
  await waitHealth();
  const started = await fetch(`${BASE}/api/health`).then((response) => response.json());
  const checkoutRoot = started.checkoutRoot ? path.resolve(started.checkoutRoot) : "";
  const legacyProject = String(started.project || "");
  if (checkoutRoot !== ROOT && !(checkoutRoot === "" && legacyProject.startsWith(ROOT + path.sep))) {
    throw new Error(
      `started QA server does not belong to this checkout: ${checkoutRoot || legacyProject || "unknown"}`,
    );
  }
}

/**
 * On first call, snapshot the exact current fixtures tree. On later calls,
 * restore that snapshot. This preserves pre-existing user changes and never
 * asks git to discard work.
 */
export function cleanupFixtures() {
  restoreFixtureSnapshot();
}

/** True when fixtures exactly match their per-process pre-QA snapshot. */
export function fixtureSnapshotMatches() {
  captureFixtureSnapshot();
  return treeDigest(FIXTURES_DIR) === fixtureSnapshotDigest;
}

export { waitEditorReady, BASE, ROOT };
