/**
 * Dev-only: turn a local PPTD directory into the Penpal setPPTD payload.
 * Production never imports this module.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const KNOWN_PROJECTS = [
  {
    id: "yu7",
    path: "fixtures/okp-yu7-ppt",
    label: "YU7 官方样例",
  },
  {
    id: "pi-rpc",
    path: "output/pi-rpc-demo",
    label: "Pi RPC 生成",
  },
  {
    id: "playbook",
    path: "output/playbook-demo",
    label: "Playbook 生成",
  },
  {
    id: "syn-smoke",
    path: "fixtures/syn-smoke",
    label: "合成 smoke",
  },
  {
    id: "syn-shapes",
    path: "fixtures/syn-shapes",
    label: "对照形状样张",
  },
  {
    id: "syn-shapes-177",
    path: "fixtures/syn-shapes-177",
    label: "OOXML 177 presets",
  },
  {
    id: "ab-consulting",
    path: "docs/editor-oracle/runs/iframe-compare/generated/ab-consulting",
    label: "生成 · 咨询复盘",
  },
  {
    id: "ab-academic",
    path: "docs/editor-oracle/runs/iframe-compare/generated/ab-academic",
    label: "生成 · 学术课件",
  },
  {
    id: "ab-promo",
    path: "docs/editor-oracle/runs/iframe-compare/generated/ab-promo",
    label: "生成 · 品牌发布",
  },
  {
    id: "ab-work",
    path: "docs/editor-oracle/runs/iframe-compare/generated/ab-work",
    label: "生成 · 技术路线",
  },
];

export async function loadVendorLib(repoRoot) {
  const libPath = path.join(
    repoRoot,
    "vendor/open-kimi-ppt/skill-1.2.0/editor/lib.js",
  );
  return import(pathToFileURL(libPath).href);
}

export function resolveProject(repoRoot, requested) {
  const raw = String(requested || "").trim();
  if (!raw) throw new Error("project is required");
  const known = KNOWN_PROJECTS.find((p) => p.id === raw || p.path === raw);
  const rel = known ? known.path : raw;
  const full = path.isAbsolute(rel) ? path.resolve(rel) : path.resolve(repoRoot, rel);
  const root = path.resolve(repoRoot);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error(`project outside repo: ${requested}`);
  }
  if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) {
    throw new Error(`project not found: ${requested}`);
  }
  return {
    id: known?.id || path.basename(full),
    label: known?.label || path.basename(full),
    rel: path.relative(root, full) || ".",
    full,
  };
}

export function findManifest(projectDir) {
  const names = fs.readdirSync(projectDir);
  const manifests = names.filter((n) => n.toLowerCase().endsWith(".pptd"));
  if (manifests.length === 0) throw new Error(`no .pptd in ${projectDir}`);
  const preferred =
    manifests.find((n) => n === "deck.pptd") ||
    manifests.find((n) => n === "yu7.pptd") ||
    manifests[0];
  return path.join(projectDir, preferred);
}

export function indexProjectFiles(projectDir) {
  const index = new Map();
  function walk(dir, prefix = "") {
    for (const name of fs.readdirSync(dir)) {
      if (name === ".DS_Store") continue;
      const rel = prefix ? `${prefix}/${name}` : name;
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full, rel);
      else index.set(rel.replaceAll("\\", "/"), full);
    }
  }
  walk(projectDir);
  return index;
}

export function resolveIndexedPath(fileIndex, requestedPath, manifestDirectory = "") {
  if (typeof requestedPath !== "string" || !requestedPath.trim()) return null;
  if (/^(?:data:image\/|https?:\/\/|blob:)/i.test(requestedPath)) return requestedPath;
  let candidate = requestedPath.replace(/^file:\/\/+/, "").replaceAll("\\", "/");
  try {
    candidate = decodeURIComponent(candidate);
  } catch {
    // keep literal percent signs
  }
  const direct = [];
  const normalized = candidate.replace(/^\.\//, "").replace(/^\/+/, "");
  if (normalized) direct.push(normalized);
  if (manifestDirectory && normalized) {
    direct.push(`${manifestDirectory.replace(/\/$/, "")}/${normalized}`);
  }
  for (const p of direct) {
    if (fileIndex.has(p)) return p;
  }
  for (const key of fileIndex.keys()) {
    if (direct.some((d) => key === d || key.endsWith(`/${d}`))) return key;
  }
  return null;
}

export function buildDeckPayload(projectDir, vendorLib, projectId = path.basename(projectDir)) {
  const manifestPath = findManifest(projectDir);
  const manifestContent = fs.readFileSync(manifestPath, "utf8");
  const pagePaths = vendorLib.extractPagePaths(manifestContent);
  const manifestFile = path.basename(manifestPath);
  const pages = [];
  const missing = [];
  for (const pagePath of pagePaths.slice(0, 500)) {
    const full = path.join(projectDir, pagePath);
    if (!fs.existsSync(full)) {
      missing.push(pagePath);
      continue;
    }
    pages.push({ path: pagePath, content: fs.readFileSync(full, "utf8") });
  }
  if (pages.length === 0) throw new Error(".pptd pages are unreadable");
  const title = vendorLib.titleFromManifest(
    manifestContent,
    path.basename(manifestFile, ".pptd"),
  );
  return {
    id: projectId,
    title,
    manifestPath: manifestFile,
    manifestContent,
    pages,
    basePath: "",
    isCreate: true,
    missing,
    pageCount: pages.length,
  };
}
