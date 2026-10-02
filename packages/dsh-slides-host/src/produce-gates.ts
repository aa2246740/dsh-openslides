import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  PRODUCE_GATES_ID,
  PRODUCE_GATE_REL_FILES,
  inspectProduceGates,
  assertProduceGates,
  type ProduceGateReport,
} from "@open-slidestudio/presentation-run";
import { createEmptyProject, loadProject } from "@open-slidestudio/pptd-v2";
import { decideWritePage } from "./write-page.js";

export class StaleProduceGatesError extends Error {
  override readonly name = "StaleProduceGatesError";
  readonly code = "stale_produce_gates";
  constructor(
    readonly report: HubProduceGateReport,
    detail?: string,
  ) {
    super(
      detail ??
        `Hub generate refused: loaded produce gates are stale or missing (id=${report.id} missing=${report.missing.join(",") || "-"} failed=${report.failed.join(",") || "-"} hashMatch=${report.hashMatch}). Profile dist must match workspace. Did not fall back to Gemini.`,
    );
  }
}

export type HubProduceGateReport = ProduceGateReport & {
  readonly hashMatch: boolean;
  readonly workspaceHash?: string;
  readonly loadedHash?: string;
  readonly emptyWriteRejected: boolean;
  readonly emptyCreateHasNoSeed: boolean;
  readonly generateReady: boolean;
};

function hashFiles(files: readonly string[]): string | undefined {
  const h = crypto.createHash("sha256");
  for (const file of files) {
    if (!fs.existsSync(file)) return undefined;
    h.update(path.basename(file));
    h.update(fs.readFileSync(file));
  }
  return h.digest("hex");
}

function loadedPresentationRunDir(): string {
  return path.dirname(fileURLToPath(import.meta.resolve("@open-slidestudio/presentation-run")));
}

function loadedHostDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

function loadedPptdV2Dir(): string {
  return path.dirname(fileURLToPath(import.meta.resolve("@open-slidestudio/pptd-v2")));
}

function loadedGateFiles(): string[] {
  const pr = loadedPresentationRunDir();
  const host = loadedHostDir();
  return [
    path.join(pr, "produce-gates.js"),
    path.join(pr, "domain", "layout-qa.js"),
    path.join(pr, "domain", "compose-ir.js"),
    path.join(pr, "domain", "theme-pack.js"),
    path.join(pr, "domain", "agent-tools.js"),
    path.join(pr, "domain", "run-ledger.js"),
    path.join(pr, "domain", "page-raster.js"),
    path.join(pr, "capabilities.js"),
    path.join(host, "write-page.js"),
    path.join(host, "tools.js"),
    path.join(host, "director-brief.js"),
    path.join(loadedPptdV2Dir(), "parse.js"),
    path.join(loadedPptdV2Dir(), "theme.js"),
    path.resolve(pr, "../../exporter-native/dist/export-pptd.js"),
  ];
}

function workspaceGateFiles(root: string): string[] {
  return PRODUCE_GATE_REL_FILES.map((rel) => path.join(root, rel));
}

const emptyLeftover = {
  id: "16_content",
  pageType: "content",
  elements: [
    {
      elementId: "cl-bg",
      elementType: "shape",
      bounds: [0, 0, 960, 540],
      fill: { type: "solid", color: "#06223F" },
    },
  ],
};

export function emptyWriteIsRejectedByLoadedHost(): boolean {
  const decision = decideWritePage(emptyLeftover, undefined, {
    pageCount: 16,
    lastBasename: "16_content",
  });
  return (
    decision.action === "reject" &&
    decision.outcome.outcome === "rejected" &&
    /empty_closer/.test(decision.outcome.detail)
  );
}

export function emptyCreateHasNoSeedFromLoadedPptd(): boolean {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-empty-create-"));
  try {
    const created = createEmptyProject(dir, { title: "hub empty create" });
    const loaded = loadProject(dir);
    const listed = [
      ...created.presentation.pages,
      ...loaded.presentation.pages,
      ...created.pages.map((page) => page.path),
      ...loaded.pages.map((page) => page.path),
    ];
    return (
      created.pages.length === 0 &&
      loaded.pages.length === 0 &&
      !listed.some((rel) => rel.replace(/\\/g, "/").split("/").pop() === "1_cover.page") &&
      !fs.existsSync(path.join(dir, "pages", "1_cover.page"))
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function inspectHubProduceGates(workspaceRoot?: string): HubProduceGateReport {
  const behavioral = inspectProduceGates();
  const emptyWriteRejected = emptyWriteIsRejectedByLoadedHost();
  const emptyCreateHasNoSeed = emptyCreateHasNoSeedFromLoadedPptd();
  const loadedHash = hashFiles(loadedGateFiles());
  const root = workspaceRoot?.trim();
  const workspaceHash = root ? hashFiles(workspaceGateFiles(root)) : undefined;
  const hashMatch = !root || (Boolean(workspaceHash) && workspaceHash === loadedHash);
  const failed = [
    ...behavioral.failed,
    ...(!emptyWriteRejected ? ["host-empty-write"] : []),
    ...(!emptyCreateHasNoSeed ? ["host-empty-create-seed"] : []),
    ...(!hashMatch ? ["stale-profile-hash"] : []),
    ...(!loadedHash ? ["loaded-hash"] : []),
    ...(root && !workspaceHash ? ["workspace-hash"] : []),
  ];
  const ok = behavioral.ok && emptyWriteRejected && emptyCreateHasNoSeed && hashMatch && Boolean(loadedHash);
  return {
    ...behavioral,
    id: behavioral.id || PRODUCE_GATES_ID,
    missing: behavioral.missing,
    failed,
    ok,
    hashMatch,
    workspaceHash,
    loadedHash,
    emptyWriteRejected,
    emptyCreateHasNoSeed,
    generateReady: ok,
  };
}

export function assertHubProduceGatesReady(workspaceRoot?: string): HubProduceGateReport {
  assertProduceGates();
  const report = inspectHubProduceGates(workspaceRoot);
  if (!report.ok) throw new StaleProduceGatesError(report);
  return report;
}
