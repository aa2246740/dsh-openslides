#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import {
  loadProject,
} from "@open-slidestudio/pptd-v2";
import {
  inspectProjectCapabilities,
  inspectRunLedger,
  pageIdMatchesFile,
  persistPageKey,
  stableSha256,
} from "@open-slidestudio/presentation-run";

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function usage() {
  console.error("Usage: node scripts/qa/audit-generated-editable-pptx.mjs --project <path> --expected-pages <n>");
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project") out.project = argv[++index];
    else if (arg === "--expected-pages") out.expectedPages = Number(argv[++index]);
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function matches(xml, pattern) {
  return [...xml.matchAll(pattern)].length;
}

function xmlAttribute(value) {
  return String(value)
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parsePolylinePoints(points) {
  const source = String(points ?? "").trim();
  if (!source || /[ml]/.test(source)) return undefined;
  const numberSource = "[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?";
  const tokenPattern = new RegExp(`M|L|${numberSource}`, "g");
  const tokens = source.match(tokenPattern) ?? [];
  if (source.replace(tokenPattern, "").replace(/[,\s]/g, "")) return undefined;
  const parsed = [];
  if (tokens.includes("M") || tokens.includes("L")) {
    if (tokens[0] !== "M" || tokens.length < 6 || (tokens.length - 3) % 3 !== 0) return undefined;
    parsed.push([Number(tokens[1]), Number(tokens[2])]);
    for (let index = 3; index < tokens.length; index += 3) {
      if (tokens[index] !== "L") return undefined;
      parsed.push([Number(tokens[index + 1]), Number(tokens[index + 2])]);
    }
  } else {
    const numbers = tokens.map(Number);
    if (numbers.length < 4 || numbers.length % 2 !== 0) return undefined;
    for (let index = 0; index < numbers.length; index += 2) {
      parsed.push([numbers[index], numbers[index + 1]]);
    }
  }
  return parsed.length >= 2 && parsed.every((point) => point.every(Number.isFinite)) ? parsed : undefined;
}

function numberAttribute(attributes, name) {
  const match = String(attributes ?? "").match(new RegExp(`\\b${name}="(-?\\d+)"`));
  return match ? Number(match[1]) : undefined;
}

function nearEmu(actual, expected, tolerance = 2) {
  return Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= tolerance;
}

function currentTodo(root) {
  const file = path.join(root, "_agent", "run-ledger.v1.json");
  if (!fs.existsSync(file)) return undefined;
  const ledger = readJson(file);
  return [...(Array.isArray(ledger.facts) ? ledger.facts : [])]
    .reverse()
    .find((fact) => fact?.type === "todo.committed");
}

function sourcePageEvidence(project) {
  return project.pages.map((loaded, index) => {
    const counts = {};
    const size = project.presentation.size;
    let fullPageImages = 0;
    let exportableNonImages = 0;
    const lines = [];
    const rotatedShapes = [];
    for (const element of loaded.page.elements) {
      counts[element.elementType] = (counts[element.elementType] ?? 0) + 1;
      const [x, y, width, height] = element.bounds;
      if (element.elementType === "image") {
        const area = width * height;
        const surface = size[0] * size[1];
        if (x <= size[0] * 0.02 && y <= size[1] * 0.02 && area >= surface * 0.95) {
          fullPageImages += 1;
        }
      } else {
        const microscopicHiddenChart = element.elementType === "chart" &&
          width <= 4 && height <= 4 && (element.opacity ?? 1) <= 0.05;
        if (!microscopicHiddenChart) exportableNonImages += 1;
      }
      if (element.elementType === "line") {
        const parsedPoints = parsePolylinePoints(element.points);
        lines.push({
          slideIndex: index,
          elementId: element.elementId,
          source: {
            bounds: element.bounds,
            viewBox: element.viewBox,
            points: element.points,
            ...(element.rotation !== undefined ? { rotation: element.rotation } : {}),
            ...(element.opacity !== undefined ? { opacity: element.opacity } : {}),
            ...(element.flipH !== undefined ? { flipH: element.flipH } : {}),
            ...(element.flipV !== undefined ? { flipV: element.flipV } : {}),
          },
          parsedPoints,
          expectedSegmentCount: parsedPoints ? parsedPoints.length - 1 : undefined,
        });
      }
      if (element.elementType === "shape" && element.rotation !== undefined) {
        rotatedShapes.push({
          slideIndex: index,
          elementId: element.elementId,
          rotation: element.rotation,
        });
      }
    }
    return {
      index: index + 1,
      path: loaded.path,
      pageId: persistPageKey(loaded.path),
      elementCount: loaded.page.elements.length,
      elementTypes: counts,
      exportableNonImages,
      sourceImages: counts.image ?? 0,
      fullPageImages,
      lines,
      rotatedShapes,
      pageSha256: stableSha256({ ...structuredClone(loaded.page), id: persistPageKey(loaded.path) }),
    };
  });
}

function relationshipTarget(slideEntry, target) {
  const decoded = decodeURIComponent(target);
  if (decoded.startsWith("/")) return decoded.slice(1);
  return path.posix.normalize(path.posix.join(path.posix.dirname(slideEntry), decoded));
}

async function pptxEvidence(file, sourcePages) {
  const bytes = fs.readFileSync(file);
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const names = Object.keys(zip.files);
  const slideNames = names
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
  const presentationXml = await zip.file("ppt/presentation.xml")?.async("string");
  const sizeMatch = presentationXml?.match(/<p:sldSz\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
  const slideSize = sizeMatch ? [Number(sizeMatch[1]), Number(sizeMatch[2])] : undefined;
  const missingRelationships = [];
  const slides = [];

  for (const [index, slideName] of slideNames.entries()) {
    const xml = await zip.file(slideName)?.async("string") ?? "";
    const shapes = matches(xml, /<p:sp(?:\s|>)/g);
    const pictures = matches(xml, /<p:pic(?:\s|>)/g);
    const graphicFrames = matches(xml, /<p:graphicFrame(?:\s|>)/g);
    const connectors = matches(xml, /<p:cxnSp(?:\s|>)/g);
    const shapeGeometry = [...xml.matchAll(/<p:sp(?:\s|>)[\s\S]*?<\/p:sp>/g)].map((match) => {
      const block = match[0];
      const objectName = block.match(/<p:cNvPr\b[^>]*\bname="([^"]*)"/)?.[1];
      const xfrm = block.match(/<a:xfrm\b([^>]*)>([\s\S]*?)<\/a:xfrm>/);
      const off = xfrm?.[2].match(/<a:off\b([^>]*)\/>/);
      const ext = xfrm?.[2].match(/<a:ext\b([^>]*)\/>/);
      const custom = block.match(/<a:custGeom(?:\s|>)[\s\S]*?<\/a:custGeom>/)?.[0];
      const pathMatch = custom?.match(/<a:path\b([^>]*)>([\s\S]*?)<\/a:path>/);
      const pathPoints = pathMatch
        ? [...pathMatch[2].matchAll(/<a:pt\b([^>]*)\/>/g)].map((point) => [
            numberAttribute(point[1], "x"),
            numberAttribute(point[1], "y"),
          ])
        : undefined;
      return {
        objectName: objectName ? xmlAttribute(objectName) : undefined,
        xfrm: xfrm ? {
          x: numberAttribute(off?.[1], "x"),
          y: numberAttribute(off?.[1], "y"),
          cx: numberAttribute(ext?.[1], "cx"),
          cy: numberAttribute(ext?.[1], "cy"),
          rot: numberAttribute(xfrm[1], "rot"),
        } : undefined,
        customPath: pathMatch ? {
          w: numberAttribute(pathMatch[1], "w"),
          h: numberAttribute(pathMatch[1], "h"),
          points: pathPoints,
        } : undefined,
      };
    });
    const customGeometryShapeNames = shapeGeometry
      .filter((shape) => shape.customPath)
      .map((shape) => shape.objectName)
      .filter(Boolean);
    let fullPagePictures = 0;
    if (slideSize) {
      for (const block of xml.matchAll(/<p:pic(?:\s|>)[\s\S]*?<\/p:pic>/g)) {
        const off = block[0].match(/<a:off\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"/);
        const ext = block[0].match(/<a:ext\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
        if (!off || !ext) continue;
        const [slideWidth, slideHeight] = slideSize;
        const [x, y] = [Number(off[1]), Number(off[2])];
        const [width, height] = [Number(ext[1]), Number(ext[2])];
        if (
          x <= slideWidth * 0.02 && y <= slideHeight * 0.02 &&
          width * height >= slideWidth * slideHeight * 0.95
        ) fullPagePictures += 1;
      }
    }

    const relName = `ppt/slides/_rels/${path.posix.basename(slideName)}.rels`;
    const relXml = await zip.file(relName)?.async("string");
    if (relXml) {
      for (const rel of relXml.matchAll(/<Relationship\b([^>]*)\/>/g)) {
        const attrs = rel[1];
        if (/\bTargetMode="External"/.test(attrs)) continue;
        const target = attrs.match(/\bTarget="([^"]+)"/)?.[1];
        if (!target) continue;
        const resolved = relationshipTarget(slideName, target);
        if (!zip.file(resolved)) missingRelationships.push(`${slideName} -> ${resolved}`);
      }
    }

    const editableObjects = shapes + graphicFrames + connectors;
    const source = sourcePages[index];
    slides.push({
      index: index + 1,
      shapes,
      pictures,
      graphicFrames,
      connectors,
      customGeometryShapeNames,
      shapeGeometry,
      editableObjects,
      fullPagePictures,
      sourceNonImages: source?.exportableNonImages ?? 0,
      sourceImages: source?.sourceImages ?? 0,
      editableRetention: !source || editableObjects >= source.exportableNonImages,
      imageRetention: !source || pictures >= source.sourceImages,
      rasterOnly: pictures > 0 && editableObjects === 0,
    });
  }

  return {
    bytes: bytes.length,
    crcReadable: true,
    hasContentTypes: Boolean(zip.file("[Content_Types].xml")),
    hasPresentation: Boolean(presentationXml),
    slideSize,
    slideCount: slideNames.length,
    chartPartCount: names.filter((name) => /^ppt\/charts\/chart\d+\.xml$/.test(name)).length,
    missingRelationships,
    slides,
  };
}

function required(checks, id, ok, detail, pending = false) {
  checks.push({ id, status: ok ? "pass" : pending ? "not-ready" : "fail", detail });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (!options.project || !Number.isInteger(options.expectedPages) || options.expectedPages < 1) {
    usage();
    process.exitCode = 1;
    return;
  }

  const root = path.resolve(options.project);
  const checks = [];
  const report = {
    version: 1,
    mode: "read-only-existing-artifact",
    project: root,
    expectedPages: options.expectedPages,
    checkedAt: new Date().toISOString(),
    checks,
  };

  const manifest = path.join(root, "deck.pptd");
  if (!fs.existsSync(manifest)) {
    required(checks, "project.manifest", false, "deck.pptd is missing");
    report.status = "fail";
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "editable-pptx-audit-"));
  const snapshotRoot = path.join(scratch, "project");
  try {
  // The official project/ledger inspectors coordinate through a write-lock
  // directory. Run them on a disposable byte-for-byte snapshot so this audit
  // never creates, repairs, or removes anything inside the user's project.
  fs.cpSync(root, snapshotRoot, { recursive: true });
  const project = loadProject(snapshotRoot);
  const sourcePages = sourcePageEvidence(project);
  const todo = currentTodo(snapshotRoot);
  const inspection = inspectRunLedger(snapshotRoot);
  const capabilities = inspectProjectCapabilities(snapshotRoot);
  report.source = {
    title: project.presentation.title ?? "",
    pageCount: project.pages.length,
    pages: sourcePages,
  };
  report.ledger = {
    todoCount: inspection.todoCount,
    structuralReview: inspection.structuralReview,
    composeReady: inspection.composeReady,
    composed: inspection.composed,
    composeBlockers: inspection.composeBlockers,
    pages: inspection.pages,
  };
  report.review = {
    visionMode: capabilities.vision.mode,
    visualStatus: capabilities.vision.mode === "none" ? "not-assessed" : "ledger-required",
    claim: capabilities.vision.mode === "none"
      ? "Text-only model: structural and deterministic layout evidence only; no visual pass is claimed."
      : "The run ledger requires current-revision visual reviews for this configured vision mode.",
  };

  required(
    checks,
    "pages.expected-count",
    project.pages.length === options.expectedPages,
    `persisted=${project.pages.length} expected=${options.expectedPages}`,
    project.pages.length < options.expectedPages,
  );
  required(
    checks,
    "pages.non-empty",
    sourcePages.length > 0 && sourcePages.every((page) => page.elementCount > 0),
    `empty=${sourcePages.filter((page) => page.elementCount === 0).map((page) => page.pageId).join(",") || "none"}`,
    project.pages.length < options.expectedPages,
  );
  required(
    checks,
    "pages.native-elements",
    sourcePages.length > 0 && sourcePages.every((page) => page.exportableNonImages > 0),
    `pages without editable non-image elements=${sourcePages.filter((page) => page.exportableNonImages === 0).map((page) => page.pageId).join(",") || "none"}`,
    project.pages.length < options.expectedPages,
  );

  const planned = Array.isArray(todo?.pageIds) ? todo.pageIds.map(String) : [];
  const missingPlanPages = planned.filter((pageId) => !project.pages.some((page) => pageIdMatchesFile(pageId, page.path)));
  const extraPages = project.pages
    .filter((page) => !planned.some((pageId) => pageIdMatchesFile(pageId, page.path)))
    .map((page) => page.path);
  required(
    checks,
    "plan.expected-page-identity",
    todo?.itemCount === options.expectedPages && planned.length === options.expectedPages &&
      missingPlanPages.length === 0 && extraPages.length === 0,
    `todo=${todo?.itemCount ?? 0} missing=${missingPlanPages.join(",") || "none"} extra=${extraPages.join(",") || "none"}`,
    project.pages.length < options.expectedPages,
  );

  const staleLedgerPages = sourcePages.filter((source) => {
    const ledgerPage = inspection.pages.find((page) => pageIdMatchesFile(page.pageId, source.path));
    return !ledgerPage || ledgerPage.pageSha256 !== source.pageSha256;
  });
  required(
    checks,
    "ledger.current-page-revisions",
    sourcePages.length === options.expectedPages && staleLedgerPages.length === 0,
    `stale-or-missing=${staleLedgerPages.map((page) => page.pageId).join(",") || "none"}`,
    project.pages.length < options.expectedPages,
  );
  required(
    checks,
    "ledger.deterministic-layout",
    inspection.pages.length === options.expectedPages && inspection.pages.every((page) => page.layout === "pass"),
    `non-pass=${inspection.pages.filter((page) => page.layout !== "pass").map((page) => `${page.pageId}:${page.layout}`).join(",") || "none"}`,
    project.pages.length < options.expectedPages,
  );
  required(checks, "ledger.structural-review", inspection.structuralReview === "pass", inspection.structuralReview, !inspection.composed);
  required(
    checks,
    "ledger.compose-ready",
    inspection.composeReady,
    inspection.composeBlockers.join("; ") || "no blockers",
    !inspection.composed,
  );
  required(checks, "ledger.composed-current", inspection.composed, String(inspection.composed), !inspection.composed);

  const exportReportPath = path.join(root, "_agent", "export", "export-report.json");
  if (!fs.existsSync(exportReportPath)) {
    required(checks, "export.report", false, "_agent/export/export-report.json is missing", true);
  } else {
    const exported = readJson(exportReportPath);
    report.export = { report: exported };
    const pptxFile = path.resolve(root, String(exported.src ?? ""));
    required(
      checks,
      "export.report",
      exported.ok === true && exported.slideCount === options.expectedPages,
      `ok=${exported.ok} slideCount=${exported.slideCount}`,
    );
    required(checks, "export.native-coverage", exported.nativeCoverage === 1, String(exported.nativeCoverage));
    const degradations = Array.isArray(exported.degradations) ? exported.degradations : [];
    const rasterDegradations = degradations.filter((row) =>
      row?.kind === "full-page-raster" || /full-page|raster slide|screenshot slide/i.test(String(row?.reason ?? ""))
    );
    required(checks, "export.no-full-page-raster-report", rasterDegradations.length === 0, `count=${rasterDegradations.length}`);
    required(checks, "export.no-degradations", degradations.length === 0, `count=${degradations.length}`);
    required(
      checks,
      "export.editable-charts",
      Array.isArray(exported.editDataCharts?.failed) && exported.editDataCharts.failed.length === 0,
      `failed=${exported.editDataCharts?.failed?.join(",") || "none"}`,
    );
    required(
      checks,
      "export.path-contained",
      Boolean(exported.src) && inside(root, pptxFile) && path.extname(pptxFile).toLowerCase() === ".pptx",
      path.relative(root, pptxFile),
    );
    if (exported.src && inside(root, pptxFile) && fs.existsSync(pptxFile)) {
      const pptx = await pptxEvidence(pptxFile, sourcePages);
      report.export.pptx = { file: pptxFile, ...pptx };
      const sourceLines = sourcePages.flatMap((page) => page.lines);
      const lineEvidence = Array.isArray(exported.editableLines) ? exported.editableLines : [];
      const keyOf = (row) => `${row?.slideIndex}:${row?.elementId}`;
      const sourceByKey = new Map(sourceLines.map((row) => [keyOf(row), row]));
      const evidenceCounts = new Map();
      for (const row of lineEvidence) {
        const key = keyOf(row);
        evidenceCounts.set(key, (evidenceCounts.get(key) ?? 0) + 1);
      }
      const invalidLineEvidence = [];
      for (const source of sourceLines) {
        const key = keyOf(source);
        const evidence = lineEvidence.find((row) => keyOf(row) === key);
        if (!source.parsedPoints) invalidLineEvidence.push(`${key}:unsupported-source-points`);
        if (!evidence) {
          invalidLineEvidence.push(`${key}:missing`);
          continue;
        }
        if (evidenceCounts.get(key) !== 1) invalidLineEvidence.push(`${key}:duplicate`);
        if (!sameJson(evidence.source, source.source)) invalidLineEvidence.push(`${key}:source-mismatch`);
        if (evidence.preserved !== true || evidence.output?.kind !== "custom-geometry") {
          invalidLineEvidence.push(`${key}:not-preserved`);
        }
        if (evidence.output?.segmentCount !== source.expectedSegmentCount) {
          invalidLineEvidence.push(`${key}:segment-count`);
        }
      }
      for (const evidence of lineEvidence) {
        if (!sourceByKey.has(keyOf(evidence))) invalidLineEvidence.push(`${keyOf(evidence)}:unexpected`);
      }
      required(
        checks,
        "export.editable-line-evidence",
        invalidLineEvidence.length === 0 && lineEvidence.length === sourceLines.length,
        `source=${sourceLines.length} report=${lineEvidence.length} invalid=${invalidLineEvidence.join(",") || "none"}`,
      );
      const missingCustomGeometry = lineEvidence
        .filter((evidence) => evidence.preserved === true && evidence.output?.kind === "custom-geometry")
        .filter((evidence) => !pptx.slides[evidence.slideIndex]?.customGeometryShapeNames.includes(evidence.output.objectName))
        .map((evidence) => `${keyOf(evidence)}:${evidence.output?.objectName ?? "unnamed"}`);
      required(
        checks,
        "pptx.editable-line-custom-geometry",
        missingCustomGeometry.length === 0 && lineEvidence.length === sourceLines.length,
        `named custom geometry missing=${missingCustomGeometry.join(",") || "none"}`,
      );
      const invalidNumericGeometry = [];
      const [sourceWidth, sourceHeight] = project.presentation.size;
      const [slideWidth, slideHeight] = pptx.slideSize ?? [];
      for (const source of sourceLines) {
        const key = keyOf(source);
        const evidence = lineEvidence.find((row) => keyOf(row) === key);
        if (!evidence || !source.parsedPoints || !slideWidth || !slideHeight) {
          invalidNumericGeometry.push(`${key}:unsupported-or-missing`);
          continue;
        }
        const candidates = pptx.slides[source.slideIndex]?.shapeGeometry
          .filter((shape) => shape.objectName === evidence.output?.objectName) ?? [];
        if (candidates.length !== 1) {
          invalidNumericGeometry.push(`${key}:named-shape-count-${candidates.length}`);
          continue;
        }
        const geometry = candidates[0];
        if (!geometry.xfrm || !geometry.customPath) {
          invalidNumericGeometry.push(`${key}:missing-xfrm-or-path`);
          continue;
        }
        const [x, y, width, height] = source.source.bounds;
        const [viewWidth, viewHeight] = source.source.viewBox ?? [];
        if (!(viewWidth > 0 && viewHeight > 0)) {
          invalidNumericGeometry.push(`${key}:invalid-viewBox`);
          continue;
        }
        const expectedXfrm = {
          x: x / sourceWidth * slideWidth,
          y: y / sourceHeight * slideHeight,
          cx: width / sourceWidth * slideWidth,
          cy: height / sourceHeight * slideHeight,
        };
        if (!Object.entries(expectedXfrm).every(([name, expected]) => nearEmu(geometry.xfrm[name], expected))) {
          invalidNumericGeometry.push(`${key}:bounds-xfrm`);
        }
        if (!nearEmu(geometry.customPath.w, expectedXfrm.cx) || !nearEmu(geometry.customPath.h, expectedXfrm.cy)) {
          invalidNumericGeometry.push(`${key}:path-size`);
        }
        const actualPoints = geometry.customPath.points ?? [];
        if (actualPoints.length !== source.parsedPoints.length) {
          invalidNumericGeometry.push(`${key}:path-point-count`);
        } else {
          for (let index = 0; index < source.parsedPoints.length; index += 1) {
            const expectedPoint = [
              source.parsedPoints[index][0] / viewWidth * expectedXfrm.cx,
              source.parsedPoints[index][1] / viewHeight * expectedXfrm.cy,
            ];
            if (!nearEmu(actualPoints[index]?.[0], expectedPoint[0]) || !nearEmu(actualPoints[index]?.[1], expectedPoint[1])) {
              invalidNumericGeometry.push(`${key}:path-point-${index}`);
            }
          }
        }
      }
      required(
        checks,
        "pptx.editable-line-numeric-geometry",
        invalidNumericGeometry.length === 0 && sourceLines.length === lineEvidence.length,
        `invalid=${invalidNumericGeometry.join(",") || "none"}`,
      );
      const rotatedShapes = sourcePages.flatMap((page) => page.rotatedShapes);
      const invalidShapeRotations = [];
      for (const source of rotatedShapes) {
        const key = `${source.slideIndex}:${source.elementId}`;
        const candidates = pptx.slides[source.slideIndex]?.shapeGeometry
          .filter((shape) => shape.objectName === source.elementId) ?? [];
        const expected = Number(source.rotation) * 60_000;
        if (candidates.length !== 1 || !Number.isFinite(expected)) {
          invalidShapeRotations.push(`${key}:unsupported-or-missing`);
          continue;
        }
        const actual = candidates[0].xfrm?.rot ?? 0;
        if (!nearEmu(actual, expected)) invalidShapeRotations.push(`${key}:rot-${actual}-expected-${expected}`);
      }
      required(
        checks,
        "pptx.shape-rotation",
        invalidShapeRotations.length === 0,
        `source=${rotatedShapes.length} invalid=${invalidShapeRotations.join(",") || "none"}`,
      );
      required(checks, "pptx.byte-count", pptx.bytes === exported.bytes, `file=${pptx.bytes} report=${exported.bytes}`);
      required(checks, "pptx.package-readable", pptx.crcReadable && pptx.hasContentTypes && pptx.hasPresentation, "CRC and core OOXML parts");
      required(checks, "pptx.slide-parts", pptx.slideCount === options.expectedPages, `slides=${pptx.slideCount}`);
      required(checks, "pptx.relationships", pptx.missingRelationships.length === 0, `missing=${pptx.missingRelationships.join(",") || "none"}`);
      required(
        checks,
        "pptx.native-object-retention",
        pptx.slides.length === sourcePages.length && pptx.slides.every((slide) => slide.editableRetention && slide.imageRetention),
        `failed=${pptx.slides.filter((slide) => !slide.editableRetention || !slide.imageRetention).map((slide) => slide.index).join(",") || "none"}`,
      );
      required(
        checks,
        "pptx.no-raster-only-slides",
        pptx.slides.every((slide) => !slide.rasterOnly),
        `raster-only=${pptx.slides.filter((slide) => slide.rasterOnly).map((slide) => slide.index).join(",") || "none"}`,
      );
    } else {
      required(checks, "pptx.file", false, "reported PPTX file is missing", true);
    }
  }

  const failed = checks.some((check) => check.status === "fail");
  const pending = checks.some((check) => check.status === "not-ready");
  report.artifactStatus = failed ? "fail" : pending ? "not-ready" : "pass";
  report.overallStatus = report.artifactStatus === "pass" && report.review.visualStatus === "not-assessed"
    ? "artifact-pass-visual-unassessed"
    : report.artifactStatus;
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = failed ? 1 : pending ? 2 : 0;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: "fail",
    error: error instanceof Error ? error.message : String(error),
    scriptRoot: SCRIPT_ROOT,
  }, null, 2));
  process.exitCode = 1;
});
