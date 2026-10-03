// edit-text, insert-shape, insert-table, chart-edit, insert-image, inspector-arrange, context-menu
import fs from "node:fs";
import path from "node:path";
import { REPO, editorUrl, newPage, openEditor, rawPageAt, readPageAt, sleep, waitForCommand } from "../lib.mjs";

const elements = (deck, idx = 0) => readPageAt(deck, idx).elements ?? [];
const byId = (deck, id, idx = 0) => elements(deck, idx).find((e) => e.elementId === id);
const canvasIds = (page) => page.$$eval("#slide .el[data-id]", (n) => n.map((e) => e.dataset.id));

/** The inspector collapses itself while the AI panel is open; expand it on purpose. */
async function ensureInspector(page) {
  // The panel appears (and may auto-collapse to a 48px strip) only after the select command returns.
  await page.waitForFunction(() => !document.getElementById("property-panel")?.hidden, null, { timeout: 5000 });
  await sleep(150);
  if (await page.locator("#property-panel.is-collapsed").count()) {
    await page.click("#property-toggle");
    await page.waitForFunction(() => !document.getElementById("property-panel").classList.contains("is-collapsed"));
    await sleep(150);
  }
}
async function openSection(page, name) {
  await page.locator(`[data-inspector-section="${name}"]`).first().evaluate((n) => {
    if ("open" in n) n.open = true;
  });
}
const selectEl = async (page, id) => {
  await page.locator(`#slide .el[data-id="${id}"]`).click();
  await sleep(150);
};
const blankCanvas = (page) => page.locator("#viewport").click({ position: { x: 6, y: 6 } });

export const features = [
  {
    id: "edit-text",
    title: "Edit text on the canvas: double-click, commit, cancel, style, link, undo",
    async run(ctx, rec) {
      const deck = ctx.deck("edit-text");
      const MARK = "VERIFY-9z";
      const page = await newPage(ctx, rec);
      await openEditor(page, ctx, deck);

      // double-click enters contenteditable; typing + click-away commits
      await page.locator('#slide .el[data-id="slogan"]').dblclick();
      await page.waitForFunction(() => document.querySelector("#slide .el.is-editing, #slide .el[contenteditable='true']"));
      rec.check("dblclick makes the node contenteditable", await page.evaluate(() => !!document.activeElement?.isContentEditable));
      await page.keyboard.press("Control+a");
      await page.keyboard.type(MARK);
      await blankCanvas(page);
      rec.check("commit wrote the text into the .page file", await rec.until(() => JSON.stringify(byId(deck, "slogan")).includes(MARK)));
      rec.check("canvas shows the new text", (await page.locator('#slide .el[data-id="slogan"]').innerText()).includes(MARK));
      await rec.shot(page, "01-committed");

      // Escape discards
      await page.locator('#slide .el[data-id="cover-en"]').dblclick();
      await page.keyboard.press("Control+a");
      await page.keyboard.type("DISCARD-ME");
      await page.keyboard.press("Escape");
      await sleep(400);
      rec.check("Escape does not commit", !rawPageAt(deck, 0).includes("DISCARD-ME"));
      rec.check("Escape restores the canvas text", !(await page.locator('#slide .el[data-id="cover-en"]').innerText()).includes("DISCARD-ME"));

      // style: select, inspector formatting
      await selectEl(page, "slogan");
      await ensureInspector(page);
      const bold = page.locator('[data-control="element.text.toolbar.bold.toggle"]').first();
      rec.check("bold toggle is in the inspector", (await bold.count()) === 1);
      const beforeStyle = JSON.stringify(byId(deck, "slogan"));
      const seenBefore = rec.commands.length;
      const boldDone = waitForCommand(page, "setBold");
      await bold.click();
      await boldDone;
      rec.check("bold changed the element on disk", await rec.until(() => JSON.stringify(byId(deck, "slogan")) !== beforeStyle), `commands: ${rec.commands.slice(seenBefore).join(",")}`);
      const size = page.locator("#ctx-fontsize");
      if (await size.count()) {
        const sizeDone = waitForCommand(page, "setTextStyle");
        await size.fill("31");
        await size.press("Tab");
        await sizeDone;
        rec.check("font size 31 persisted", await rec.until(() => /fontSize\W+31/.test(JSON.stringify(byId(deck, "slogan")))), JSON.stringify(byId(deck, "slogan").content).slice(0, 160));
      } else rec.check("font size input exists", false, "#ctx-fontsize missing");

      // link dialog
      const linkBtn = page.locator('[data-control="element.text.toolbar.link.set"]').first();
      if (await linkBtn.count()) {
        await linkBtn.click();
        await page.waitForSelector("#text-link-dialog[open], #text-link-dialog:not([hidden])");
        await page.fill("#text-link-input", "https://example.com/verify");
        await page.click("#text-link-save");
        rec.check("link saved to the element", await rec.until(() => rawPageAt(deck, 0).includes("https://example.com/verify")));
        await rec.shot(page, "02-link-saved");
      } else rec.check("link control exists", false);

      // undo the last edit
      const idsBefore = await canvasIds(page);
      await page.click("#btn-undo");
      rec.check("undo reverts the link", await rec.until(() => !rawPageAt(deck, 0).includes("https://example.com/verify")));

      // persistence
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector("#slide .el[data-id]");
      await sleep(300);
      rec.check("committed text survives a reload", (await page.locator('#slide .el[data-id="slogan"]').innerText()).includes(MARK));
      rec.check("element set unchanged by text edits", idsBefore.length === (await canvasIds(page)).length);
      await page.__context.close();
    },
  },

  {
    id: "insert-shape",
    title: "Insert a shape and a line from the palette",
    async run(ctx, rec) {
      const deck = ctx.deck("insert-shape");
      const page = await newPage(ctx, rec);
      await openEditor(page, ctx, deck);
      const n0 = elements(deck).length;

      await page.click('[data-control="insert.shape"]');
      await page.waitForSelector("#shape-palette", { state: "visible" });
      await page.waitForSelector("#shape-grid .shape-cell");
      const all = await page.locator("#shape-grid .shape-cell").count();
      rec.check("gallery offers many shapes", all >= 20, all);
      await page.fill("#shape-search", "arrow");
      await sleep(250);
      const filtered = await page.locator("#shape-grid .shape-cell").count();
      rec.check("search narrows the gallery", filtered > 0 && filtered < all, `${all} -> ${filtered}`);
      await page.fill("#shape-search", "圆");
      await sleep(250);
      rec.note(`shape search is English-only: "arrow" finds ${filtered}, "圆" finds ${await page.locator("#shape-grid .shape-cell").count()} (gallery titles are English)`);
      await page.fill("#shape-search", "");
      await sleep(200);
      await rec.shot(page, "01-palette");

      let w = waitForCommand(page, "insert");
      await page.locator("#shape-grid .shape-cell").first().click();
      await w;
      await sleep(250);
      const afterShape = elements(deck);
      const added = afterShape.slice(n0);
      rec.check("one shape element appended on disk", added.length === 1 && added[0].elementType === "shape", JSON.stringify(added.map((e) => e.elementType)));
      rec.check("palette closed after insert", await page.locator("#shape-palette").isHidden());
      rec.check("new shape is selected on canvas", (await page.locator("#slide .el.selected").count()) >= 1);

      await page.click('[data-control="insert.shape"]');
      await page.waitForSelector("#shape-palette", { state: "visible" });
      await page.click('#lib-tabs [data-lib="line"]');
      await page.waitForSelector("#line-presets button");
      w = waitForCommand(page, "insert");
      await page.locator("#line-presets button").first().click();
      await w;
      await sleep(250);
      const afterLine = elements(deck).slice(afterShape.length);
      rec.check("a line element was appended", afterLine.some((e) => e.elementType === "line"), JSON.stringify(afterLine.map((e) => e.elementType)));
      await rec.shot(page, "02-after-line");
      await page.__context.close();
    },
  },

  {
    id: "insert-table",
    title: "Insert a table with the size grid",
    async run(ctx, rec) {
      const deck = ctx.deck("insert-table");
      const page = await newPage(ctx, rec);
      await openEditor(page, ctx, deck);
      const n0 = elements(deck).length;
      await page.click('[data-control="insert.table"]');
      await page.waitForSelector("#table-size", { state: "visible" });
      const cell = page.locator('#table-size-grid .table-size-cell[data-r="3"][data-c="4"]');
      await cell.hover();
      rec.check("hover labels the size", (await page.locator("#table-size-label").innerText()).replace(/\s/g, "") === "3×4", await page.locator("#table-size-label").innerText());
      await rec.shot(page, "01-size-grid");
      const w = waitForCommand(page, "insert");
      await cell.click();
      await w;
      await sleep(250);
      const t = elements(deck).slice(n0).find((e) => e.elementType === "table");
      rec.check("a table element was written", !!t);
      rec.check("table has 3 rows", t?.rows?.length === 3, t?.rows?.length);
      rec.check("table has 4 columns", t?.columnWidths?.length === 4 || t?.rows?.[0]?.length === 4 || t?.rows?.[0]?.cells?.length === 4, JSON.stringify(t?.columnWidths));
      rec.check("table painted on canvas", (await page.locator("#slide .el.table").count()) >= 1);
      await rec.shot(page, "02-table");
      await page.__context.close();
    },
  },

  {
    id: "chart-edit",
    title: "Edit a chart: switch type, edit data in the overlay, persist",
    async run(ctx, rec) {
      const deck = ctx.deck("chart-edit");
      const page = await newPage(ctx, rec);
      await openEditor(page, ctx, deck);
      rec.check("there is no insert.chart button (charts come from the agent)", (await page.locator('[data-control="insert.chart"]').count()) === 0);
      const seeded = await page.evaluate(async () => {
        const project = new URLSearchParams(location.search).get("project") || "";
        const res = await fetch(`/api/command?project=${encodeURIComponent(project)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cmd: "insert", kind: "chart" }),
        });
        return res.status;
      });
      rec.check("seeding a chart through the command path works", seeded === 200, seeded);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector("#slide .el.chart");
      await page.locator("#slide .el.chart").first().click();
      await ensureInspector(page);
      await page.waitForSelector("#ctx-bar #pop-chart-type");
      const svg = () => page.locator("#slide .el.chart").first().innerHTML();
      rec.check("starts as a bar chart", (await svg()).includes("<rect"));

      await page.locator("#pop-chart-type button.ctx-icon").click();
      await page.locator("#pop-chart-type .ctx-btn", { hasText: "折线" }).click();
      await page.waitForFunction(() => document.querySelector("#slide .el.chart")?.innerHTML.includes("<polyline"));
      rec.check("type switch to 折线 repaints as a line chart", true);
      await sleep(400);
      const chartOnDisk = () => elements(deck).find((e) => e.elementType === "chart");
      rec.check("type change persisted", JSON.stringify(chartOnDisk()).includes("line"), JSON.stringify(chartOnDisk()?.series ?? []).slice(0, 120));

      await page.locator('#ctx-bar [data-control="element.chart.data.set"]').click();
      await page.waitForSelector("#chart-overlay:not([hidden])");
      const head = page.locator("#chart-grid th.s1 input").first();
      await head.fill("营收");
      await head.dispatchEvent("change");
      await page.locator("#chart-overlay button", { hasText: "+ 行" }).click();
      await sleep(400);
      const rows = page.locator("#chart-grid tr:not(.add-row)");
      const last = rows.nth((await rows.count()) - 1);
      await last.locator("td input").nth(0).fill("D");
      const val = last.locator("td input").nth(1);
      await val.fill("7");
      await val.dispatchEvent("change");
      await sleep(700);
      await rec.shot(page, "01-data-overlay");
      // invalid numeric value is refused
      await val.fill("abc");
      await val.dispatchEvent("change");
      await sleep(300);
      rec.check("non-numeric value is marked invalid", (await val.evaluate((n) => n.classList.contains("is-invalid"))) === true);
      await val.fill("7");
      await val.dispatchEvent("change");
      await sleep(700);
      await page.evaluate(() => document.getElementById("slide").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })));
      await page.waitForFunction(() => document.getElementById("chart-overlay")?.hidden, null, { timeout: 4000 });
      rec.check("clicking the slide closes the overlay", true);
      await sleep(500);
      const c = chartOnDisk();
      rec.check("renamed series header is on disk", JSON.stringify(c?.data).includes("营收"), JSON.stringify(c?.data));
      rec.check("new row D=7 is on disk", JSON.stringify(c?.data?.rows).includes('"D",7'), JSON.stringify(c?.data?.rows));
      await page.__context.close();
    },
  },

  {
    id: "insert-image",
    title: "Insert an image through the file chooser",
    ignoreErrors: [/status of 400/],
    async run(ctx, rec) {
      const deck = ctx.deck("insert-image");
      const src = fs.readdirSync(path.join(REPO, "fixtures/okp-yu7-ppt/media")).find((f) => /\.(png|jpe?g)$/i.test(f));
      const file = path.join(REPO, "fixtures/okp-yu7-ppt/media", src);
      const page = await newPage(ctx, rec);
      await openEditor(page, ctx, deck);
      const mediaBefore = fs.readdirSync(path.join(deck, "media"));
      const n0 = elements(deck).length;
      const chooser = page.waitForEvent("filechooser");
      const w = waitForCommand(page, "insert", 15000);
      await page.click('[data-control="insert.image"]');
      await (await chooser).setFiles(file);
      await w;
      await sleep(400);
      const mediaAfter = fs.readdirSync(path.join(deck, "media"));
      rec.check("a new file landed in media/", mediaAfter.length === mediaBefore.length + 1, `${mediaBefore.length} -> ${mediaAfter.length}`);
      const img = elements(deck).slice(n0).find((e) => e.elementType === "image");
      rec.check("an image element points at media/", !!img && /^media\//.test(img.src ?? ""), img?.src);
      rec.check("image painted on canvas", (await page.locator("#slide .el.image").count()) >= 1);
      await rec.shot(page, "01-image-inserted");
      // a non-image is refused
      const bad = path.join(ctx.scratchRoot, "not-an-image.svg");
      fs.writeFileSync(bad, "<svg xmlns='http://www.w3.org/2000/svg'/>");
      const chooser2 = page.waitForEvent("filechooser");
      await page.click('[data-control="insert.image"]');
      await (await chooser2).setFiles(bad);
      await sleep(600);
      rec.check("an .svg is refused (no extra element)", elements(deck).length === n0 + 1, elements(deck).length);
      await page.__context.close();
    },
  },

  {
    id: "inspector-arrange",
    title: "Inspector: X/Y/W/H, opacity, drag, multi-select, duplicate, delete",
    async run(ctx, rec) {
      // Part 1: numeric fields. Moving/resizing an element can park it under another
      // one, so the pointer steps below use a second, untouched deck.
      const deck = ctx.deck("inspector-arrange");
      const page = await newPage(ctx, rec, { width: 1600, height: 1000 });
      await openEditor(page, ctx, deck);
      await selectEl(page, "slogan");
      await ensureInspector(page);
      rec.check("inspector is titled after the selection", (await page.locator("#property-title").innerText()).length > 0, await page.locator("#property-title").innerText());
      await openSection(page, "position-arrange");
      const boundsNow = () => byId(deck, "slogan").bounds;
      // One change event, on the node we just wrote. fill() plus a later dispatchEvent races a
      // repaint: the second event lands on the rebuilt input and commits the number it still shows.
      const setNum = async (sel, v, { refused = false } = {}) => {
        const answered = refused ? null : waitForCommand(page, "setBounds", 4000).catch(() => null);
        await page.locator(sel).evaluate((input, value) => {
          input.value = String(value);
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }, v);
        if (refused) {
          await sleep(200);
          return;
        }
        await answered;
        await page.waitForFunction(
          ([selector, expected]) => document.querySelector(selector)?.value === String(expected),
          [sel, v],
          { timeout: 4000 },
        );
      };
      await setNum("#ctx-bounds-0", 123);
      rec.check("X persisted", await rec.until(() => boundsNow()[0] === 123), JSON.stringify(boundsNow()));
      await setNum("#ctx-bounds-1", 234);
      rec.check("Y persisted", await rec.until(() => boundsNow()[1] === 234), JSON.stringify(boundsNow()));
      await setNum("#ctx-bounds-2", 345);
      rec.check("width persisted", await rec.until(() => boundsNow()[2] === 345), JSON.stringify(boundsNow()));
      await setNum("#ctx-bounds-3", 77);
      rec.check("height persisted", await rec.until(() => boundsNow()[3] === 77), JSON.stringify(boundsNow()));
      await setNum("#ctx-bounds-2", 0, { refused: true });
      rec.check("width 0 is refused, old value kept", boundsNow()[2] === 345, JSON.stringify(boundsNow()));
      rec.check("the refusal is shown inline", (await page.locator(".property-field-error, [aria-invalid='true']").count()) > 0);
      // Two fields committed in the same tick (before any repaint) must both land, on top of the earlier edits.
      await page.evaluate(() => {
        for (const [id, value] of [["ctx-bounds-1", 300], ["ctx-bounds-3", 120]]) {
          const input = document.getElementById(id);
          input.value = String(value);
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
      rec.check("two edits in the same tick both persist", await rec.until(() => JSON.stringify(boundsNow()) === JSON.stringify([123, 300, 345, 120])), JSON.stringify(boundsNow()));

      const op = page.locator('input[data-control="element.opacity.set"]').first();
      if (await op.count()) {
        await op.evaluate((n) => {
          n.value = "50";
          n.dispatchEvent(new Event("input", { bubbles: true }));
          n.dispatchEvent(new Event("change", { bubbles: true }));
        });
        rec.check("opacity 50% persisted as 0.5", await rec.until(() => byId(deck, "slogan").opacity === 0.5), byId(deck, "slogan").opacity);
      } else rec.check("opacity slider exists", false);
      await rec.shot(page, "01-inspector");
      await page.__context.close();

      // Part 2: pointer work on a pristine deck.
      const deck2 = ctx.deck("inspector-arrange-pointer");
      const p2 = await newPage(ctx, rec, { width: 1600, height: 1000 });
      await openEditor(p2, ctx, deck2);
      await selectEl(p2, "slogan");
      const box = await p2.locator('#slide .el[data-id="slogan"]').boundingBox();
      const pre = byId(deck2, "slogan").bounds.slice();
      await p2.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await p2.mouse.down();
      await p2.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 8 });
      await p2.mouse.up();
      const moved = await rec.until(() => {
        const b = byId(deck2, "slogan").bounds;
        return b[0] !== pre[0] || b[1] !== pre[1];
      });
      const post = byId(deck2, "slogan").bounds;
      rec.check("dragging moved the element on disk", moved, `${JSON.stringify(pre)} -> ${JSON.stringify(post)}`);
      rec.check("dragging left the size alone", post[2] === pre[2] && post[3] === pre[3]);
      await rec.shot(p2, "02-after-drag");
      await p2.__context.close();

      // Part 3: selection, duplicate, delete on another pristine deck.
      const deck3 = ctx.deck("inspector-arrange-selection");
      const p3 = await newPage(ctx, rec, { width: 1600, height: 1000 });
      await openEditor(p3, ctx, deck3);
      await selectEl(p3, "slogan");
      await p3.locator('#slide .el[data-id="cover-en"]').click({ modifiers: ["Shift"] });
      await sleep(250);
      rec.check("shift-click makes a multi-selection", (await p3.locator("#slide .el.selected").count()) === 2 && /2/.test(await p3.locator("#property-title").innerText()), await p3.locator("#property-title").innerText());
      await rec.shot(p3, "03-multi-select");
      await blankCanvas(p3);
      await sleep(200);
      rec.check("blank canvas click clears the selection", (await p3.locator("#slide .el.selected").count()) === 0);
      rec.check("with nothing selected the inspector gives its space back", await p3.evaluate(() => {
        const p = document.getElementById("property-panel");
        return p.classList.contains("is-empty") && p.getBoundingClientRect().width === 0;
      }));

      await selectEl(p3, "slogan");
      await ensureInspector(p3);
      const n = elements(deck3).length;
      await p3.locator('[data-control="element.duplicate"]').first().click();
      rec.check("duplicate adds one element", await rec.until(() => elements(deck3).length === n + 1), elements(deck3).length);
      await p3.keyboard.press("Delete");
      rec.check("Delete key removes the selection", await rec.until(() => elements(deck3).length === n), elements(deck3).length);
      await p3.__context.close();
    },
  },

  {
    id: "context-menu",
    title: "Right-click menu on an element and on blank canvas",
    async run(ctx, rec) {
      const deck = ctx.deck("context-menu");
      const page = await newPage(ctx, rec);
      await openEditor(page, ctx, deck);
      await selectEl(page, "slogan");
      await page.locator('#slide .el[data-id="slogan"]').click({ button: "right" });
      await page.waitForSelector("#ctx-menu:not([hidden])");
      const items = await page.$$eval("#ctx-menu button", (b) => b.map((x) => x.textContent.replace(/\s+/g, " ").trim()));
      rec.check("element menu offers clipboard, order, group, lock, delete", ["剪切", "复制", "粘贴", "复制副本", "置于顶层", "编组", "锁定", "删除"].every((t) => items.some((i) => i.includes(t))), items.join(" | "));
      await rec.shot(page, "01-element-menu");
      const n = elements(deck).length;
      await page.locator("#ctx-menu button", { hasText: "复制副本" }).click();
      rec.check("复制副本 adds an element", await rec.until(() => elements(deck).length === n + 1));
      rec.check("menu closes after a choice", await page.locator("#ctx-menu").isHidden());
      await page.__context.close();

      // The default deck's pages are covered by a full-page shape, so use an empty deck.
      const empty = ctx.deck("context-menu-empty", "syn-empty");
      const p2 = await newPage(ctx, rec);
      await p2.goto(editorUrl(ctx, empty), { waitUntil: "domcontentloaded" });
      await p2.waitForSelector("#workspace-cover", { state: "hidden", timeout: 10000 }).catch(() => {});
      await p2.waitForSelector("#slide");
      await sleep(600);
      const card = await p2.locator("#slide").boundingBox();
      await p2.mouse.click(card.x + card.width / 2, card.y + card.height / 2, { button: "right" });
      await p2.waitForSelector("#ctx-menu:not([hidden])", { timeout: 4000 }).catch(() => {});
      const blank = await p2.$$eval("#ctx-menu:not([hidden]) button", (b) => b.map((x) => x.textContent.replace(/\s+/g, " ").trim()));
      rec.check("blank-canvas menu is paste only", blank.length === 1 && blank[0].includes("粘贴"), blank.join(" | ") || "(menu did not open)");
      await rec.shot(p2, "02-blank-menu");
      await p2.keyboard.press("Escape");
      rec.check("Escape closes the menu", await p2.locator("#ctx-menu").isHidden());
      await p2.__context.close();
    },
  },
];
