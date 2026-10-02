/**
 * Lightweight slide raster export (PNG) for PRD export matrix.
 * Not design-perfect — text/shapes/charts as canvas approximations.
 */

import type { Deck, Slide, SlideElement } from "@open-slidestudio/pptd";
import { downloadBlob } from "./download";

function fillColor(el: SlideElement): string {
  if ("fill" in el && el.fill && typeof el.fill === "object" && "color" in el.fill) {
    return String((el.fill as { color?: string }).color ?? "#CCCCCC");
  }
  return "#CCCCCC";
}

function drawElement(ctx: CanvasRenderingContext2D, el: SlideElement) {
  ctx.save();
  ctx.globalAlpha = el.opacity ?? 1;
  if (el.kind === "shape") {
    ctx.fillStyle = fillColor(el);
    if (el.shape === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(
        el.x + el.width / 2,
        el.y + el.height / 2,
        el.width / 2,
        el.height / 2,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    } else {
      const r = el.cornerRadius ?? 0;
      roundRect(ctx, el.x, el.y, el.width, el.height, r);
      ctx.fill();
    }
  } else if (el.kind === "text") {
    const text = el.paragraphs
      .map((p) => p.runs.map((r) => r.text).join(""))
      .join("\n");
    const size = el.paragraphs[0]?.runs[0]?.fontSize ?? 20;
    const color = el.paragraphs[0]?.runs[0]?.color ?? "#111";
    ctx.fillStyle = color;
    ctx.font = `${el.paragraphs[0]?.runs[0]?.fontWeight ?? 400} ${size}px Inter, system-ui, sans-serif`;
    wrapText(ctx, text, el.x + 8, el.y + size + 4, el.width - 16, size * 1.25);
  } else if (el.kind === "chart") {
    ctx.fillStyle = "#F3F6FA";
    ctx.fillRect(el.x, el.y, el.width, el.height);
    ctx.strokeStyle = "#D0D7E2";
    ctx.strokeRect(el.x, el.y, el.width, el.height);
    const max = Math.max(1, ...el.series.flatMap((s) => s.values));
    const cats = el.categories.length || 1;
    const barW = (el.width - 40) / cats;
    el.categories.forEach((cat, i) => {
      const v = el.series[0]?.values[i] ?? 0;
      const h = ((el.height - 40) * v) / max;
      ctx.fillStyle = el.series[0]?.color ?? "#1F6FEB";
      ctx.fillRect(el.x + 20 + i * barW + 4, el.y + el.height - 20 - h, barW - 8, h);
      ctx.fillStyle = "#555";
      ctx.font = "12px Inter, system-ui, sans-serif";
      ctx.fillText(cat.slice(0, 8), el.x + 20 + i * barW + 4, el.y + el.height - 6);
    });
  } else if (el.kind === "table") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(el.x, el.y, el.width, el.height);
    ctx.strokeStyle = "#ccc";
    ctx.strokeRect(el.x, el.y, el.width, el.height);
    ctx.fillStyle = "#222";
    ctx.font = "14px Inter, system-ui, sans-serif";
    ctx.fillText(`Table ${el.rows}×${el.cols}`, el.x + 12, el.y + 24);
  } else if (el.kind === "smartart") {
    const n = el.nodes.length || 1;
    const boxW = (el.width - 20) / n - 12;
    el.nodes.forEach((node, i) => {
      const x = el.x + 10 + i * (boxW + 12);
      ctx.fillStyle = "#1F6FEB";
      roundRect(ctx, x, el.y + el.height / 2 - 40, boxW, 80, 10);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "16px Inter, system-ui, sans-serif";
      ctx.fillText(node.text.slice(0, 14), x + 10, el.y + el.height / 2 + 6);
    });
  } else if (el.kind === "image") {
    ctx.fillStyle = "#E8ECF1";
    ctx.fillRect(el.x, el.y, el.width, el.height);
    ctx.fillStyle = "#667";
    ctx.font = "14px Inter, system-ui, sans-serif";
    ctx.fillText("Image", el.x + 12, el.y + 24);
  }
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const lines = text.split("\n");
  let yy = y;
  for (const line of lines) {
    const words = line.split(/\s+/);
    let cur = "";
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && cur) {
        ctx.fillText(cur, x, yy);
        yy += lineHeight;
        cur = w;
      } else {
        cur = test;
      }
    }
    if (cur) {
      ctx.fillText(cur, x, yy);
      yy += lineHeight;
    }
  }
}

export async function slideToPngBlob(slide: Slide): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = slide.size.width;
  canvas.height = slide.size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const bg =
    slide.background && "color" in slide.background
      ? String(slide.background.color)
      : "#FFFFFF";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const els = [...slide.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  for (const el of els) drawElement(ctx, el);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))), "image/png");
  });
}

export async function exportDeckPngs(deck: Deck) {
  const slides = [...deck.slides].sort((a, b) => a.order - b.order);
  for (let i = 0; i < slides.length; i++) {
    const blob = await slideToPngBlob(slides[i]!);
    const name = `${safe(deck.title)}-slide-${i + 1}.png`;
    downloadBlob(blob, name, "image/png");
    // brief pause so browsers don't collapse multi-download
    await new Promise((r) => setTimeout(r, 120));
  }
}

export async function exportCurrentSlidePng(deck: Deck, slideId: string) {
  const slide = deck.slides.find((s) => s.id === slideId) ?? deck.slides[0];
  if (!slide) throw new Error("No slide");
  const blob = await slideToPngBlob(slide);
  downloadBlob(blob, `${safe(deck.title)}-slide.png`, "image/png");
}

/** Minimal multi-page PDF (text-only drawing via PNG embed is heavy; use simple page boxes). */
export async function exportDeckPdf(deck: Deck) {
  // Generate a simple multi-image HTML print file as PDF fallback via print dialog
  const slides = [...deck.slides].sort((a, b) => a.order - b.order);
  const parts: string[] = [];
  for (const s of slides) {
    const blob = await slideToPngBlob(s);
    const url = URL.createObjectURL(blob);
    parts.push(
      `<div style="page-break-after:always;width:100%;"><img src="${url}" style="width:100%;height:auto;" /></div>`,
    );
  }
  const html = `<!doctype html><html><head><title>${escapeHtml(deck.title)}</title>
<style>@page{size:landscape;margin:0}body{margin:0}</style></head>
<body>${parts.join("")}<script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) throw new Error("Popup blocked — allow popups to export PDF");
  w.document.write(html);
  w.document.close();
}

function safe(s: string) {
  return (s || "deck").replace(/[^\w\- ]+/g, "").trim() || "deck";
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}
