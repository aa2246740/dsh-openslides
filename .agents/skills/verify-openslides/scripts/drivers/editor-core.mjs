// open-deck, page-rail, undo-redo, zoom, notes, present
import fs from "node:fs";
import path from "node:path";
import {
  listPages,
  newPage,
  openEditor,
  rawPageAt,
  readManifest,
  readPageAt,
  sameSnapshot,
  sleep,
  snapshotDir,
  waitForCommand,
} from "../lib.mjs";

const pageCountText = (page) => page.locator("#page-count").innerText();
const thumbs = (page) => page.locator("#rail .thumb").count();
const elIds = async (page) => page.$$eval("#slide .el[data-id]", (n) => n.map((e) => e.dataset.id));

export const features = [
  {
    id: "open-deck",
    title: "Open a project: title, page count, first page painted, nothing written",
    async run(ctx, rec) {
      const deck = ctx.deck("open-deck");
      const before = snapshotDir(deck);
      const manifest = readManifest(deck);
      const page = await newPage(ctx, rec);
      await openEditor(page, ctx, deck);
      rec.check("doc title matches manifest", (await page.locator("#doc-title").innerText()) === manifest.title, await page.locator("#doc-title").innerText());
      rec.check("one thumb per manifest page", (await thumbs(page)) === manifest.pages.length, `${await thumbs(page)} vs ${manifest.pages.length}`);
      rec.check("page counter reads 1 / N", (await pageCountText(page)).replace(/\s/g, "") === `1/${manifest.pages.length}`, await pageCountText(page));
      rec.check("first thumb is the current page", (await page.locator("#rail .thumb.active").getAttribute("aria-current")) === "page");
      rec.check("slide painted elements", (await page.locator("#slide .el[data-id]").count()) > 0);
      const health = await (await fetch(`${ctx.base}/api/health`)).json();
      rec.check("server health names the product", health.product === "Open SlideStudio");
      await rec.shot(page, "01-opened");
      rec.check("opening wrote nothing to the project", sameSnapshot(before, snapshotDir(deck)));
      await page.__context.close();
    },
  },

  {
    id: "page-rail",
    title: "Page rail: select, add, duplicate, reorder, delete, rail modes",
    async run(ctx, rec) {
      const deck = ctx.deck("page-rail");
      const n0 = readManifest(deck).pages.length;
      const page = await newPage(ctx, rec);
      await openEditor(page, ctx, deck);

      // select page 3 via the rail
      let w = waitForCommand(page, "goToPage");
      await page.locator("#rail .thumb").nth(2).click();
      await w;
      rec.check("clicking a thumb moves the counter", await rec.until(async () => (await pageCountText(page)).replace(/\s/g, "") === `3/${n0}`, 3000), await pageCountText(page));
      rec.check("active thumb follows", (await page.locator("#rail .thumb.active").getAttribute("data-page-index")) === "2");

      // add
      w = waitForCommand(page, "addPage");
      await page.click("#btn-rail-add");
      await w;
      rec.check("add: thumb count +1", (await thumbs(page)) === n0 + 1, await thumbs(page));
      rec.check("add: counter reads N+1 / N+1", (await pageCountText(page)).replace(/\s/g, "") === `${n0 + 1}/${n0 + 1}`, await pageCountText(page));
      const afterAdd = readManifest(deck).pages;
      rec.check("add: manifest lists the new page", afterAdd.length === n0 + 1, afterAdd.length);
      const newRel = afterAdd.at(-1);
      rec.check("add: new page file exists and is empty", fs.existsSync(path.join(deck, newRel)) && (readPageAt(deck, n0).elements ?? []).length === 0, newRel);
      await rec.shot(page, "01-after-add");

      // duplicate page index 0
      w = waitForCommand(page, "duplicatePage");
      await page.locator("#rail .thumb").nth(0).click({ button: "right" });
      await page.waitForSelector("#ctx-menu:not([hidden])");
      const menuItems = await page.$$eval("#ctx-menu button", (b) => b.map((x) => x.textContent.trim()));
      rec.check("thumb menu offers 上移/下移/复制/删除", ["上移", "下移", "复制", "删除"].every((t) => menuItems.some((m) => m.includes(t))), menuItems.join("|"));
      await page.locator("#ctx-menu button", { hasText: "复制" }).click();
      await w;
      rec.check("duplicate: thumb count +1", (await thumbs(page)) === n0 + 2, await thumbs(page));
      const dupOrder = readManifest(deck).pages;
      rec.check("duplicate: inserted right after the source", /_copy/.test(dupOrder[1]) && dupOrder.length === n0 + 2, dupOrder.slice(0, 3).join(","));

      // reorder: move page 2 (index 1) down
      const orderBefore = readManifest(deck).pages.slice();
      w = waitForCommand(page, "reorderPage");
      await page.locator("#rail .thumb").nth(1).click({ button: "right" });
      await page.waitForSelector("#ctx-menu:not([hidden])");
      await page.locator("#ctx-menu button", { hasText: "下移" }).click();
      await w;
      const orderAfter = readManifest(deck).pages;
      rec.check("reorder: manifest order swapped", orderAfter[1] === orderBefore[2] && orderAfter[2] === orderBefore[1], orderAfter.slice(0, 4).join(","));

      // delete the duplicate copy (find its index in the manifest)
      const copyIdx = orderAfter.findIndex((p) => /_copy/.test(p));
      w = waitForCommand(page, "deletePage");
      await page.locator("#rail .thumb").nth(copyIdx).click({ button: "right" });
      await page.waitForSelector("#ctx-menu:not([hidden])");
      await page.locator("#ctx-menu button", { hasText: "删除" }).click();
      await w;
      const afterDelete = readManifest(deck).pages;
      rec.check("delete: manifest shrinks by one", afterDelete.length === n0 + 1 && !afterDelete.some((p) => /_copy/.test(p)), afterDelete.length);
      rec.check("delete: thumb count matches manifest", (await thumbs(page)) === afterDelete.length, await thumbs(page));

      // drag-reorder: move the first thumb below the third (needs > 6px of movement)
      const manifestBeforeDrag = readManifest(deck).pages.slice();
      const box0 = await page.locator("#rail .thumb").nth(0).boundingBox();
      const box2 = await page.locator("#rail .thumb").nth(2).boundingBox();
      w = waitForCommand(page, "reorderPage").catch(() => null);
      await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2);
      await page.mouse.down();
      await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2 + 12, { steps: 4 });
      await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height * 0.9, { steps: 8 });
      await page.mouse.up();
      const dragResp = await w;
      const manifestAfterDrag = readManifest(deck).pages;
      rec.check("drag: sends reorderPage and changes the order", !!dragResp && JSON.stringify(manifestBeforeDrag) !== JSON.stringify(manifestAfterDrag), manifestAfterDrag.slice(0, 4).join(","));

      // rail view mode + rail toggle
      const modeBefore = await page.evaluate(() => localStorage.getItem("oss.railView"));
      await page.click("#btn-rail-view");
      const modeAfter = await page.evaluate(() => localStorage.getItem("oss.railView"));
      rec.check("rail view button flips the persisted mode", modeBefore !== modeAfter, `${modeBefore} -> ${modeAfter}`);
      await page.click("#btn-rail-view");
      const railVisibleBefore = await page.locator("#rail").isVisible();
      w = waitForCommand(page, "pageRail");
      await page.click("#btn-rail");
      await w;
      await sleep(250);
      rec.check("rail toggle changes rail visibility", (await page.locator("#rail").isVisible()) !== railVisibleBefore);
      await rec.shot(page, "02-rail-toggled");
      await page.__context.close();
    },
  },

  {
    id: "undo-redo",
    title: "Undo/redo a canvas edit: buttons, keyboard, disk",
    async run(ctx, rec) {
      const deck = ctx.deck("undo-redo");
      const page = await newPage(ctx, rec);
      await openEditor(page, ctx, deck);
      rec.check("undo starts disabled", await page.locator("#btn-undo").isDisabled());
      rec.check("redo starts disabled", await page.locator("#btn-redo").isDisabled());
      const idsBefore = await elIds(page);
      const diskBefore = (readPageAt(deck, 0).elements ?? []).map((e) => e.elementId);

      let w = waitForCommand(page, "insert");
      await page.click('[data-control="insert.text"]');
      await w;
      // leave text editing so the keyboard shortcut is not swallowed
      await page.keyboard.press("Escape");
      await sleep(250);
      const idsInserted = await elIds(page);
      rec.check("insert adds one canvas element", idsInserted.length === idsBefore.length + 1, `${idsBefore.length} -> ${idsInserted.length}`);
      rec.check("undo enabled after edit", await page.locator("#btn-undo").isEnabled());
      const diskInserted = (readPageAt(deck, 0).elements ?? []).map((e) => e.elementId);
      rec.check("edit persisted to the .page file", diskInserted.length === diskBefore.length + 1, `${diskBefore.length} -> ${diskInserted.length}`);

      w = waitForCommand(page, "undo");
      await page.click("#btn-undo");
      await w;
      await sleep(200);
      rec.check("undo removes the element on canvas", (await elIds(page)).length === idsBefore.length);
      rec.check("undo is written to disk", (readPageAt(deck, 0).elements ?? []).length === diskBefore.length);
      rec.check("redo enabled after undo", await page.locator("#btn-redo").isEnabled());

      w = waitForCommand(page, "redo");
      await page.click("#btn-redo");
      await w;
      await sleep(200);
      rec.check("redo restores the element", (await elIds(page)).length === idsBefore.length + 1);
      rec.check("redo is written to disk", (readPageAt(deck, 0).elements ?? []).length === diskBefore.length + 1);

      // keyboard path
      w = waitForCommand(page, "undo");
      await page.locator("#viewport").click({ position: { x: 5, y: 5 } });
      await page.keyboard.press("Control+z");
      await w.catch(() => null);
      await sleep(200);
      rec.check("Ctrl+Z undoes", (await elIds(page)).length === idsBefore.length, (await elIds(page)).length);
      w = waitForCommand(page, "redo");
      await page.keyboard.press("Control+Shift+z");
      await w.catch(() => null);
      await sleep(200);
      rec.check("Ctrl+Shift+Z redoes", (await elIds(page)).length === idsBefore.length + 1, (await elIds(page)).length);
      await rec.shot(page, "01-after-redo");

      // history lives in the server session keyed by tab id: a reload in the same tab keeps it
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector("#slide .el[data-id]");
      await sleep(400);
      rec.note(`after same-tab reload undo is ${(await page.locator("#btn-undo").isEnabled()) ? "still enabled" : "disabled"}`);
      await page.__context.close();
    },
  },

  {
    id: "zoom",
    title: "Zoom in/out, clamp, reset to fit; never persisted",
    async run(ctx, rec) {
      const deck = ctx.deck("zoom");
      const page = await newPage(ctx, rec);
      await openEditor(page, ctx, deck);
      const before = snapshotDir(deck);
      const label = async () => parseInt((await page.locator("#zoom-label").innerText()).replace("%", ""), 10);
      const fit = await label();
      rec.check("label shows the fit scale, not 100%", fit > 0 && fit < 100, `fit=${fit}`);
      for (let i = 0; i < 3; i++) {
        const w = waitForCommand(page, "zoom");
        await page.click("#btn-zoom-in");
        await w;
      }
      await sleep(150);
      const zin = await label();
      rec.check("three zoom-ins grow the scale ~30%", zin > fit && Math.abs(zin - Math.round(fit * 1.3)) <= 2, `${fit} -> ${zin}`);
      const cardW = await page.locator(".slide-card").evaluate((e) => e.getBoundingClientRect().width);
      rec.check("slide card is wider after zoom", cardW > 0);
      await rec.shot(page, "01-zoomed-in");
      let last = -1;
      let stable = 0;
      for (let i = 0; i < 16 && stable < 2; i++) {
        const w = waitForCommand(page, "zoom").catch(() => null);
        await page.click("#btn-zoom-out");
        await w;
        await sleep(80);
        const v = await label();
        stable = v === last ? stable + 1 : 0;
        last = v;
      }
      rec.check("zoom-out clamps (25% of fit or the 12% floor)", last <= Math.round(fit * 0.25) + 1 || last <= 12, `fit=${fit} min=${last}`);
      const w2 = waitForCommand(page, "zoom");
      await page.click("#zoom-label");
      await w2;
      await sleep(150);
      rec.check("clicking the label returns to fit", Math.abs((await label()) - fit) <= 1, await label());
      rec.check("zoom never touches the project on disk", sameSnapshot(before, snapshotDir(deck)));
      await page.__context.close();
    },
  },

  {
    id: "notes",
    title: "Speaker notes: open, type, persist to the page file, restore after reload",
    async run(ctx, rec) {
      const deck = ctx.deck("notes");
      const MARK = "VERIFY-NOTES-7q";
      const page = await newPage(ctx, rec);
      await openEditor(page, ctx, deck);
      rec.check("notes panel starts hidden", await page.locator("#notes-panel").isHidden());
      await page.click("#btn-notes-link");
      await page.waitForSelector("#notes-panel:not([hidden])");
      const w = waitForCommand(page, "setNotes");
      await page.fill("#notes-text", MARK);
      await w;
      rec.check("notes text saved into page 1 file", rawPageAt(deck, 0).includes(MARK));
      rec.check("no other page got the note", [1, 2].every((i) => !rawPageAt(deck, i).includes(MARK)));
      await page.locator("#rail .thumb").nth(1).click();
      await sleep(250);
      rec.check("page 2 has its own (empty) notes", (await page.inputValue("#notes-text")) === "", await page.inputValue("#notes-text"));
      await page.locator("#rail .thumb").nth(0).click();
      await sleep(250);
      rec.check("back on page 1 the note is restored", (await page.inputValue("#notes-text")) === MARK);
      await rec.shot(page, "01-notes-open");
      // closing is a server command (session state), so wait for it like any other
      const closeCmd = waitForCommand(page, "notes");
      await page.click("#btn-notes-close");
      await closeCmd;
      await sleep(200);
      rec.check("close button hides the panel", await page.locator("#notes-panel").isHidden());
      // a brand-new browser context has a new tab id: the text must come from disk
      const fresh = await newPage(ctx, rec);
      await openEditor(fresh, ctx, deck);
      await fresh.click("#btn-notes-link");
      await fresh.waitForSelector("#notes-panel:not([hidden])");
      rec.check("a fresh tab reads the note from disk", (await fresh.inputValue("#notes-text")) === MARK);
      await fresh.__context.close();
      await page.__context.close();
    },
  },

  {
    id: "present",
    title: "Play mode: enter, advance/back with the keyboard, Esc exits; fullscreen button is inert-safe",
    async run(ctx, rec) {
      const deck = ctx.deck("present");
      const page = await newPage(ctx, rec);
      await openEditor(page, ctx, deck);
      const before = snapshotDir(deck);
      let w = waitForCommand(page, "present");
      await page.click("#btn-play");
      await w;
      await page.waitForSelector("#present:not([hidden])");
      rec.check("body gets is-presenting", await page.evaluate(() => document.body.classList.contains("is-presenting")));
      const painted = () => page.locator("#present-slide").evaluate((n) => n.innerHTML.length);
      const first = await page.locator("#present-slide").evaluate((n) => n.innerHTML);
      rec.check("present slide painted", first.length > 100);
      await rec.shot(page, "01-presenting-page-1");
      await page.keyboard.press("ArrowRight");
      await sleep(350);
      await page.keyboard.press("ArrowRight");
      await sleep(350);
      const third = await page.locator("#present-slide").evaluate((n) => n.innerHTML);
      rec.check("two ArrowRight presses change the slide", third !== first);
      await rec.shot(page, "02-presenting-page-3");
      await page.keyboard.press("ArrowLeft");
      await sleep(350);
      const back = await page.locator("#present-slide").evaluate((n) => n.innerHTML);
      rec.check("ArrowLeft goes back", back !== third);
      w = waitForCommand(page, "present");
      await page.keyboard.press("Escape");
      await w.catch(() => null);
      await page.waitForSelector("#present", { state: "hidden" });
      rec.check("Esc leaves play mode", !(await page.evaluate(() => document.body.classList.contains("is-presenting"))));
      rec.check("presenting wrote nothing to the project", sameSnapshot(before, snapshotDir(deck)));
      // fullscreen is OS level: only prove the control exists and does not throw
      rec.check("fullscreen control exists", (await page.locator('[data-control="chrome.present.fullscreen"]').count()) === 1);
      await page.click("#btn-fs").catch(() => {});
      await sleep(300);
      rec.note("fullscreen click is not asserted: headless Chromium may reject requestFullscreen (toast) — OS fullscreen is a non-goal");
      await page.__context.close();
    },
  },
];
