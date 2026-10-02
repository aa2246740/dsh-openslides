#!/usr/bin/env node
/**
 * Dev-only A/B host: official Kimi neo-ppt iframe vs native canvas.
 * Production apps must not import this server.
 *
 *   node scripts/oracle-compare/server.mjs
 *   open http://127.0.0.1:55180/?project=yu7
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  KNOWN_PROJECTS,
  buildDeckPayload,
  indexProjectFiles,
  loadVendorLib,
  resolveIndexedPath,
  resolveProject,
} from "./deck.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const PUBLIC = path.join(__dirname, "public");
const PORT = Number(process.env.ORACLE_COMPARE_PORT || 55180);
const FALLBACK_PENPAL =
  "https://statics.moonshot.cn/neo-design/assets/penpal-C4NjirZE.js";

const vendorLibPromise = loadVendorLib(ROOT);
const nativePromise = import(
  pathToFileURL(path.join(ROOT, "packages/canvas-session/dist/index.js")).href
);

/** @type {Map<string, { session: any, canvas: any }>} */
const sessions = new Map();

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(data);
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
    }[ext] || "application/octet-stream"
  );
}

function projectFromUrl(url) {
  return resolveProject(ROOT, url.searchParams.get("project") || "yu7");
}

function fileToDataUrl(full) {
  const buf = fs.readFileSync(full);
  const mime = contentType(full);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function resolvePenpalUrl() {
  try {
    const res = await fetch(
      "https://www.kimi.com/neo-ppt/?sdkMode=ppt-editor&pptPlatform=neodeck-local",
      {
        headers: {
          "User-Agent": "OpenSlideStudio-oracle-compare/0.1",
        },
      },
    );
    const html = await res.text();
    const match = html.match(
      /https:\/\/statics\.moonshot\.cn\/[^"'\\s]+penpal-[^"'\\s]+\.js/,
    );
    if (match) return { url: match[0], source: "scrape" };
  } catch {
    // fall through
  }
  return { url: FALLBACK_PENPAL, source: "pinned" };
}

async function nativeModel(project, pageIndex) {
  const canvas = await nativePromise;
  let entry = sessions.get(project.full);
  if (!entry) {
    entry = {
      canvas,
      session: canvas.openSession(project.full, { allowedControlIds: [] }),
    };
    sessions.set(project.full, entry);
  }
  const { session } = entry;
  const idx = Number.isFinite(pageIndex) ? pageIndex : session.pageIndex;
  if (idx !== session.pageIndex) canvas.goToPage(session, idx);
  const model = canvas.renderModel(session);
  const thumbs = canvas.renderAllPages(session).map((m) => ({
    pageIndex: m.pageIndex,
    path: m.pagePaths[m.pageIndex],
    title: m.elements.find((e) => e.type === "text")?.text?.slice(0, 48),
  }));
  return { model, thumbs };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return json(res, 200, {
        ok: true,
        kind: "oracle-compare",
        production: false,
        kimiIframe: true,
        port: PORT,
      });
    }

    if (req.method === "GET" && url.pathname === "/api/projects") {
      const items = KNOWN_PROJECTS.map((p) => ({
        ...p,
        exists: fs.existsSync(path.join(ROOT, p.path)),
      }));
      return json(res, 200, { projects: items });
    }

    if (req.method === "GET" && url.pathname === "/api/penpal-url") {
      return json(res, 200, await resolvePenpalUrl());
    }

    if (req.method === "GET" && url.pathname === "/api/deck") {
      const project = projectFromUrl(url);
      const lib = await vendorLibPromise;
      const payload = buildDeckPayload(project.full, lib, project.id);
      return json(res, 200, {
        project: { id: project.id, label: project.label, path: project.rel },
        payload,
      });
    }

    if (req.method === "GET" && url.pathname === "/api/model") {
      const project = projectFromUrl(url);
      const page = Number(url.searchParams.get("page") || 0);
      return json(res, 200, {
        project: { id: project.id, label: project.label, path: project.rel },
        ...(await nativeModel(project, page)),
      });
    }

    if (req.method === "GET" && url.pathname === "/api/images") {
      const project = projectFromUrl(url);
      const index = indexProjectFiles(project.full);
      let paths = [];
      const raw = url.searchParams.get("paths");
      if (raw) {
        try {
          paths = JSON.parse(raw);
        } catch {
          paths = raw.split(",").filter(Boolean);
        }
      }
      const result = paths.map((requested) => {
        if (/^(?:data:image\/|https?:\/\/|blob:)/i.test(requested)) return requested;
        const key = resolveIndexedPath(index, requested);
        if (!key) return "";
        const full = index.get(key);
        const st = fs.statSync(full);
        if (st.size > 20 * 1024 * 1024) return "";
        return fileToDataUrl(full);
      });
      return json(res, 200, { images: result });
    }

    if (req.method === "GET" && url.pathname.startsWith("/media/")) {
      const project = projectFromUrl(url);
      const index = indexProjectFiles(project.full);
      const rel = decodeURIComponent(url.pathname.slice("/media/".length));
      const key = resolveIndexedPath(index, rel);
      if (!key) {
        res.writeHead(404);
        return res.end("not found");
      }
      const full = index.get(key);
      res.writeHead(200, {
        "Content-Type": contentType(full),
        "Cache-Control": "no-store",
      });
      return fs.createReadStream(full).pipe(res);
    }

    if (url.pathname === "/shape-paint.js") {
      const paint = path.join(ROOT, "apps/native-web/public/shape-paint.js");
      res.writeHead(200, {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-store",
      });
      return fs.createReadStream(paint).pipe(res);
    }

    let filePath = path.join(
      PUBLIC,
      url.pathname === "/" ? "index.html" : url.pathname,
    );
    if (!filePath.startsWith(PUBLIC)) {
      res.writeHead(403);
      return res.end("forbidden");
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(PUBLIC, "index.html");
    }
    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": "no-store",
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = /not found|required|outside repo/i.test(message) ? 400 : 500;
    json(res, status, { error: message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`oracle-compare (dev only)  http://127.0.0.1:${PORT}/?project=yu7`);
  console.log(`also: ?project=pi-rpc  ?project=playbook`);
  console.log(`This host embeds https://www.kimi.com/neo-ppt/ — not for production.`);
});
