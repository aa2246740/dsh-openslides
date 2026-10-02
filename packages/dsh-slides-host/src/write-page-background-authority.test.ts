import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createEmptyProject,
  listComposedPage,
  loadProject,
  saveProject,
} from "@open-slidestudio/pptd-v2";
import type { SkillPageInput } from "@open-slidestudio/presentation-run";
import { decideWritePage, readWritePageDisk } from "./write-page.js";

const PAGE_ID = "01_page";
const PACK_BACKGROUND = "#FFFFFF";
const REQUESTED_BACKGROUND = "#F2F6FF";

function page(backgroundColor: string, title = "纸飞机工作室"): SkillPageInput {
  return {
    id: PAGE_ID,
    pageType: "content",
    background: { type: "solid" as const, color: backgroundColor },
    elements: [
      {
        elementId: "title",
        elementType: "text",
        bounds: [80, 72, 800, 60] as [number, number, number, number],
        content: { text: title, fontSize: 34, color: "#03522C" },
      },
    ],
  };
}

function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "host-background-authority-"));
  const project = createEmptyProject(root, { title: "Background authority" });
  const persisted = page(PACK_BACKGROUND);
  const { id: _id, ...pageBody } = persisted;
  listComposedPage(project, `pages/${PAGE_ID}.page`, pageBody);
  saveProject(project);
  fs.mkdirSync(path.join(root, "_agent"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "_agent", "runtime.json"),
    `${JSON.stringify({ designSystemId: "consulting/pine-green-strategy" })}\n`,
  );
  return root;
}

function writeLock(root: string, scope: Record<string, unknown>, expiresAt = Date.now() + 60_000): void {
  fs.writeFileSync(
    path.join(root, "_agent", "ai-review-lock.v1.json"),
    `${JSON.stringify({ token: "background-test", expiresAt, scope })}\n`,
  );
}

function assertPackRejected(result: ReturnType<typeof decideWritePage>, color = REQUESTED_BACKGROUND): void {
  assert.equal(result.action, "reject");
  if (result.action !== "reject" || result.outcome.outcome !== "rejected") return;
  assert.match(result.outcome.detail, /pack_color/);
  assert.ok(result.outcome.detail.includes(color));
}

test("Host permits a foreign canonical page background only for an active exact page scope", () => {
  const root = fixture();
  assertPackRejected(decideWritePage(page(REQUESTED_BACKGROUND), undefined, readWritePageDisk(root)));

  writeLock(root, {
    kind: "page",
    pageId: PAGE_ID,
    targetPageIds: [PAGE_ID],
    backgroundColorOverride: true,
  });
  const allowed = decideWritePage(page(REQUESTED_BACKGROUND), undefined, readWritePageDisk(root));
  assert.equal(allowed.action, "write");

  if (allowed.action === "write") {
    const replay = decideWritePage(page(REQUESTED_BACKGROUND), {
      pageId: PAGE_ID,
      revision: 2,
      pageSha256: allowed.pageSha256,
      lastVerdict: "pass",
      yamlExists: true,
    }, readWritePageDisk(root));
    assert.equal(replay.action, "skip");
  }
});

test("Host fails closed for expired, element, malformed, duplicate, and outside-page override scopes", () => {
  const root = fixture();
  const cases: Array<{ scope: Record<string, unknown>; expiresAt?: number }> = [
    {
      scope: {
        kind: "page",
        pageId: PAGE_ID,
        targetPageIds: [PAGE_ID],
        backgroundColorOverride: true,
      },
      expiresAt: Date.now() - 1,
    },
    {
      scope: {
        kind: "elements",
        pageId: PAGE_ID,
        targetPageIds: [PAGE_ID],
        backgroundColorOverride: true,
      },
    },
    {
      scope: {
        kind: "page",
        pageId: PAGE_ID,
        targetPageIds: [PAGE_ID, PAGE_ID],
        backgroundColorOverride: true,
      },
    },
    {
      scope: {
        kind: "pages",
        pageId: "02_page",
        targetPageIds: ["02_page", "03_page"],
        backgroundColorOverride: true,
      },
    },
    {
      scope: {
        kind: "page",
        pageId: PAGE_ID,
        targetPageIds: [PAGE_ID],
        backgroundColorOverride: false,
      },
    },
  ];
  for (const entry of cases) {
    writeLock(root, entry.scope, entry.expiresAt);
    assertPackRejected(decideWritePage(page(REQUESTED_BACKGROUND), undefined, readWritePageDisk(root)));
  }
});

test("Host retains a persisted foreign background after lock release without authorizing a new one", () => {
  const root = fixture();
  const project = loadProject(root);
  assert.equal(project.pages[0]?.page.background?.type, "solid");
  project.pages[0]!.page.background = { type: "solid", color: REQUESTED_BACKGROUND };
  saveProject(project);
  fs.rmSync(path.join(root, "_agent", "ai-review-lock.v1.json"), { force: true });

  const titleOnly = decideWritePage(
    page(REQUESTED_BACKGROUND, "纸飞机工作室 · 新标题"),
    undefined,
    readWritePageDisk(root),
  );
  assert.equal(titleOnly.action, "write");

  assertPackRejected(
    decideWritePage(page("#ABCDEF", "纸飞机工作室 · 新标题"), undefined, readWritePageDisk(root)),
    "#ABCDEF",
  );
});

test("Host override never widens invalid colors or element fill colors", () => {
  const root = fixture();
  writeLock(root, {
    kind: "deck",
    pageId: PAGE_ID,
    targetPageIds: [PAGE_ID],
    backgroundColorOverride: true,
  });

  const invalid = decideWritePage(page("浅蓝"), undefined, readWritePageDisk(root));
  assert.equal(invalid.action, "reject");
  if (invalid.action === "reject" && invalid.outcome.outcome === "rejected") {
    assert.match(invalid.outcome.detail, /invalid_color/);
  }

  const shapeColor = page(REQUESTED_BACKGROUND);
  shapeColor.elements.push({
    elementId: "accent",
    elementType: "shape",
    bounds: [80, 180, 220, 80],
    shapeName: "rect",
    fill: { type: "solid", color: REQUESTED_BACKGROUND },
  });
  assertPackRejected(decideWritePage(shapeColor, undefined, readWritePageDisk(root)));
});
