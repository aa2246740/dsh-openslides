#!/usr/bin/env node
/**
 * Browser verification for image crop mode (enter, drag, finish, reset, Esc).
 * User actions go through scripts/qa/gestures.mjs.
 *   node scripts/verify-image-crop.mjs
 */
import { launchPinnedChromium } from "./lib/pinned-playwright.mjs";
import fs from "node:fs";
import path from "node:path";
import {
  openEditor,
  clickUi,
  clickEl,
  clickSlide,
  shortcut,
  chooseImageFile,
  dragCropHandle,
  readModel,
  assertPersisted,
  cleanupFixtures,
  restartNativeWebServer,
  ROOT,
} from "./qa/gestures.mjs";

const PROJECT = "fixtures/okp-yu7-ppt";
const OUT_DIR = path.resolve("output");
const IMAGE = path.join(ROOT, "fixtures/okp-yu7-ppt/media/bg_had.jpg");

fs.mkdirSync(OUT_DIR, { recursive: true });

function pass(name) {
  console.log(`PASS  ${name}`);
}

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  throw new Error(msg);
}

function lastOfType(data, type) {
  const els = data?.model?.elements || [];
  return [...els].reverse().find((e) => e.type === type) || null;
}

async function waitSelectedType(page, type) {
  await page.waitForFunction(
    (want) => {
      const el = document.querySelector("#slide .el.selected");
      return Boolean(el && el.classList.contains(want));
    },
    type,
    { timeout: 8000 },
  );
}

async function cropChrome(page, id) {
  return page.evaluate((elId) => {
    const node = document.querySelector(`#slide .el[data-id="${elId}"]`);
    if (!node) return null;
    return {
      cropping: node.classList.contains("is-cropping"),
      frame: Boolean(node.querySelector(".crop-frame")),
      resize: Boolean(node.querySelector(".handle-se:not(.handle-crop)")),
      size: node.style.backgroundSize,
    };
  }, id);
}

await restartNativeWebServer();
cleanupFixtures();

const browser = await launchPinnedChromium({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await openEditor(page, PROJECT);
  pass("editor loaded");

  await chooseImageFile(page, IMAGE);
  await waitSelectedType(page, "image");
  let data = await readModel(page);
  const image = lastOfType(data, "image");
  if (!image) fail("inserted image missing");
  const id = image.id;
  pass("insert image via file picker");

  await clickEl(page, id);
  let chrome = await cropChrome(page, id);
  if (chrome?.frame) fail("selected image showed crop chrome before entering crop mode");
  if (!chrome?.resize) fail("selected image is missing resize handles outside crop mode");
  pass("select shows cropped result, not crop chrome");

  await page.waitForSelector("#ctx-bar:not([hidden]) #crop-start", { timeout: 5000 });
  await clickUi(page, "#crop-start");
  await page.waitForSelector(`#slide .el[data-id="${id}"] .crop-frame`, { timeout: 5000 });
  chrome = await cropChrome(page, id);
  if (!chrome?.cropping || !chrome.frame) fail("裁切 did not enter crop mode");
  if (chrome.resize) fail("crop mode still shows resize handles");
  data = await readModel(page);
  const entered = (data.model?.elements || []).find((e) => e.id === id);
  const crop0 = entered?.crop || {};
  if ((crop0.left || 0) !== 0 || (crop0.top || 0) !== 0) {
    fail(`裁切 forced an inset: ${JSON.stringify(crop0)}`);
  }
  await page.screenshot({ path: path.join(OUT_DIR, "qa-crop-mode.png") });
  pass("裁切 enters mode without forcing 8% inset");

  let midFrame = null;
  await dragCropHandle(page, id, "e", -72, 0, {
    onMid: async () => {
      await page.waitForFunction(
        (elId) => {
          const frame = document.querySelector(`#slide .el[data-id="${elId}"] .crop-frame`);
          const right = frame?.style.right || "0%";
          return right !== "0%" && right !== "";
        },
        id,
        { timeout: 2000 },
      );
      midFrame = await page.evaluate((elId) => {
        const frame = document.querySelector(`#slide .el[data-id="${elId}"] .crop-frame`);
        return frame ? { right: frame.style.right, bottom: frame.style.bottom } : null;
      }, id);
      await page.screenshot({ path: path.join(OUT_DIR, "qa-crop-drag.png") });
    },
  });
  if (!midFrame || (midFrame.right === "0%" && midFrame.bottom === "0%")) {
    fail(`crop frame did not move mid-drag: ${JSON.stringify(midFrame)}`);
  }
  await page.waitForTimeout(300);
  data = await readModel(page);
  const dragged = (data.model?.elements || []).find((e) => e.id === id);
  const crop = dragged?.crop || {};
  if (!(crop.right > 0.02 || crop.bottom > 0.02)) {
    fail(`crop insets did not persist: ${JSON.stringify(crop)}`);
  }
  pass("crop handle drag updates frame live and persists");

  await clickUi(page, "#crop-done");
  await page.waitForFunction(
    (elId) => !document.querySelector(`#slide .el[data-id="${elId}"] .crop-frame`),
    id,
    { timeout: 5000 },
  );
  chrome = await cropChrome(page, id);
  if (chrome?.frame || chrome?.cropping) fail("完成 left crop chrome on");
  if (chrome?.size === "100% 100%") fail("finished crop still shows uncropped 100% 100%");
  pass("完成 exits crop mode and shows cropped result");

  await assertPersisted(page, async () => {
    const again = await readModel(page);
    const cur = (again.model?.elements || []).find((e) => e.id === id);
    const c = cur?.crop || {};
    if (!(c.right > 0.02 || c.bottom > 0.02)) {
      throw new Error(`crop lost after reload: ${JSON.stringify(c)}`);
    }
    const after = await cropChrome(page, id);
    if (after?.frame) throw new Error("reload re-entered crop mode");
  });
  pass("crop persists after reload");

  await clickEl(page, id);
  await page.waitForSelector("#ctx-bar:not([hidden]) #crop-start", { timeout: 5000 });
  await clickUi(page, "#crop-start");
  await page.waitForSelector(`#slide .el[data-id="${id}"] .crop-frame`, { timeout: 5000 });
  await shortcut(page, "Escape");
  await page.waitForFunction(
    (elId) => !document.querySelector(`#slide .el[data-id="${elId}"] .crop-frame`),
    id,
    { timeout: 5000 },
  );
  pass("Esc exits crop mode");

  await clickEl(page, id);
  await page.waitForSelector("#ctx-bar:not([hidden]) #crop-start", { timeout: 5000 });
  await clickUi(page, "#crop-start");
  await page.waitForSelector("#crop-reset", { timeout: 4000 });
  await clickUi(page, "#crop-reset");
  await page.waitForTimeout(250);
  data = await readModel(page);
  const reset = (data.model?.elements || []).find((e) => e.id === id);
  const z = reset?.crop || {};
  if ((z.left || 0) !== 0 || (z.right || 0) !== 0 || (z.top || 0) !== 0 || (z.bottom || 0) !== 0) {
    fail(`重置 did not clear crop: ${JSON.stringify(z)}`);
  }
  await clickSlide(page, 20, 20);
  await page.waitForFunction(
    (elId) => !document.querySelector(`#slide .el[data-id="${elId}"] .crop-frame`),
    id,
    { timeout: 5000 },
  );
  pass("重置 clears crop; outside click exits mode");
} finally {
  await browser.close();
  cleanupFixtures();
}
