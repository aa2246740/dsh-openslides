import fs from "node:fs";
import path from "node:path";
import { inspectRunLedger } from "./run-ledger.js";

type JsonRecord = Record<string, unknown>;

export type AuthenticGenerationStatus = {
  ready: boolean;
  reason: string;
  failures: string[];
  provider?: string;
  model?: string;
  sessionId?: string;
  pageCount: number;
  todoCount: number;
  writtenPageCount: number;
  renderCount: number;
  composeSource: "pi-rpc" | "none";
  usedPi: boolean;
};

function readJson(file: string): JsonRecord | undefined {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    return value as JsonRecord;
  } catch {
    return undefined;
  }
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function countFiles(dir: string, suffix: string): number {
  try {
    return fs.readdirSync(dir).filter((name) => name.endsWith(suffix)).length;
  } catch {
    return 0;
  }
}

function nonEmpty(rec: JsonRecord | undefined, key: string): string | undefined {
  const value = rec?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Product success proof. This deliberately reads independent artifacts instead of
 * trusting a UI flag or `result.status` produced by the same call stack.
 */
export function authenticGenerationStatus(root: string): AuthenticGenerationStatus {
  const projectRoot = path.resolve(root);
  const trace = readJson(path.join(projectRoot, "_agent", "pi-trace.json"));
  const ledger = inspectRunLedger(projectRoot);
  const provider = nonEmpty(trace, "provider");
  const model = nonEmpty(trace, "model");
  const sessionId = nonEmpty(trace, "sessionId");
  const pageCount = countFiles(path.join(projectRoot, "pages"), ".page");
  const renderCount = ledger.pages.filter((page) => page.raster).length;
  const events = strings(trace?.events);
  const failures: string[] = [];

  if (!trace) failures.push("missing pi-trace.json");
  if (trace?.usedPi !== true) failures.push("trace.usedPi is not true");
  if (trace?.produce !== "pi-tools") failures.push("trace.produce is not pi-tools");
  if (!provider) failures.push("missing provider identity");
  if (!model) failures.push("missing model identity");
  if (!sessionId) failures.push("missing Pi session id");
  if (!nonEmpty(trace, "agentStart") || !nonEmpty(trace, "agentEnd")) {
    failures.push("missing Pi agent clock");
  }
  if (!ledger.initialized) failures.push("missing run-ledger.v1.json");
  if (!ledger.referencesComplete) failures.push("required original OpenKimi chunks were not all returned");
  if (!ledger.tasteGateEnabled) failures.push("run predates the required taste execution gate");
  if (ledger.designReference !== "emitted") failures.push("selected design preview was not emitted to Pi");
  if (ledger.designContract !== "current") failures.push("design contract is missing from the current Pi context");
  if (ledger.todoCount < 2) failures.push("page plan has fewer than two items");
  if (ledger.pages.length !== ledger.todoCount) failures.push("not every planned page has a current revision");
  for (const page of ledger.pages) {
    if (!page.raster) failures.push(`${page.pageId} has no current raster receipt`);
    if (!page.imageEmitted) failures.push(`${page.pageId} PNG was not emitted to Pi image content`);
    if (page.visualReview !== "pass") failures.push(`${page.pageId} visual review is ${page.visualReview}`);
    if (page.layout !== "pass") failures.push(`${page.pageId} rendered layout is ${page.layout}`);
  }
  if (ledger.structuralReview !== "pass") {
    failures.push(`current structural review is ${ledger.structuralReview}`);
  }
  if (ledger.deckOverview !== "emitted") failures.push("current full-deck overview was not emitted to Pi");
  if (ledger.deckTasteReview !== "pass") {
    failures.push(`current grounded deck taste review is ${ledger.deckTasteReview}`);
  }
  if (!ledger.composed) failures.push("compose_deck has no current ledger seal");
  if (pageCount !== ledger.pages.length) failures.push("disk pages do not match ledger page revisions");
  if (!fs.existsSync(path.join(projectRoot, "deck.pptd"))) failures.push("missing deck.pptd");
  if (events.some((event) => /host-finish|salvage|fallback|playbook-success/i.test(event))) {
    failures.push("forbidden host or template completion event");
  }

  const ready = failures.length === 0;
  return {
    ready,
    reason: ready
      ? "provider-backed Pi read the exact sources, inspected the selected preview, committed the design contract, reviewed every page and the full deck, passed layout, structural, and taste gates, and composed this PPTD"
      : failures.join("; "),
    failures,
    provider,
    model,
    sessionId,
    pageCount,
    todoCount: ledger.todoCount,
    writtenPageCount: ledger.pages.length,
    renderCount,
    composeSource: ready ? "pi-rpc" : "none",
    usedPi: ready,
  };
}
