/**
 * Shared native shape SVG markup. Loaded by the editor (script tag) and
 * driven by unit tests — keep this the only place that emits the <svg>.
 */
(function (root) {
  let gradientSerial = 0;

  /** Escape a model string before it lands inside an SVG attribute. */
  function escAttr(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function splitGradientStops(value) {
    const out = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < value.length; i += 1) {
      if (value[i] === "(") depth += 1;
      else if (value[i] === ")") depth = Math.max(0, depth - 1);
      else if (value[i] === "," && depth === 0) {
        out.push(value.slice(start, i).trim());
        start = i + 1;
      }
    }
    out.push(value.slice(start).trim());
    return out.filter(Boolean);
  }

  function svgStopColor(css) {
    const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(css);
    if (!rgba) return { color: css, opacity: undefined };
    return {
      color: `rgb(${rgba[1]}, ${rgba[2]}, ${rgba[3]})`,
      opacity: rgba[4],
    };
  }

  function gradientPaint(css) {
    const match = /^linear-gradient\(\s*(-?[\d.]+)deg\s*,\s*(.*)\)$/i.exec(String(css || ""));
    if (!match) return null;
    const parts = splitGradientStops(match[2]);
    if (parts.length < 2) return null;
    const angle = Number(match[1]);
    const rad = ((angle - 90) * Math.PI) / 180;
    const x1 = 50 - Math.cos(rad) * 50;
    const y1 = 50 - Math.sin(rad) * 50;
    const x2 = 50 + Math.cos(rad) * 50;
    const y2 = 50 + Math.sin(rad) * 50;
    const id = `oss-shape-gradient-${gradientSerial += 1}`;
    const stops = parts
      .map((part, index) => {
        const stop = /^(.*?)\s+(-?[\d.]+%)$/.exec(part);
        const rawColor = (stop?.[1] || part).trim();
        const offset = stop?.[2] || `${Math.round((index / (parts.length - 1)) * 100)}%`;
        const paint = svgStopColor(rawColor);
        const opacity = paint.opacity == null ? "" : ` stop-opacity="${paint.opacity}"`;
        return `<stop offset="${escAttr(offset)}" stop-color="${escAttr(paint.color)}"${opacity}/>`;
      })
      .join("");
    return {
      fill: `url(#${id})`,
      defs: `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient></defs>`,
    };
  }

  /** Keep in sync with svgFillFromFillCss in packages/pptd-v2. Omitted fill is no paint. */
  function svgFillFromFillCss(fillCss) {
    if (!fillCss || fillCss === "none" || fillCss === "transparent") return "none";
    return fillCss;
  }

  function shapePaintMarkup(el) {
    const rawFill = svgFillFromFillCss(el && el.fillCss);
    const gradient = gradientPaint(rawFill);
    const fill = gradient?.fill || escAttr(rawFill);
    const stroke = el.border?.color || "none";
    const sw = Number(el.border?.width) || 0;
    const d = el.pathD;
    if (!d && !el.pathStroke) return null;
    const bodyStroke = sw > 0 && stroke && stroke !== "none" ? escAttr(stroke) : "none";
    const bodySw = bodyStroke === "none" ? 0 : sw;
    const leaderStroke = stroke && stroke !== "none" ? escAttr(stroke) : "#111";
    const leaderSw = sw || 1.5;
    const body = d
      ? `<path d="${escAttr(d)}" fill="${fill}" stroke="${bodyStroke}" stroke-width="${bodySw}" fill-rule="evenodd" vector-effect="non-scaling-stroke"/>`
      : "";
    const extra = el.pathStroke
      ? `<path d="${escAttr(el.pathStroke)}" fill="none" stroke="${leaderStroke}" stroke-width="${leaderSw}" vector-effect="non-scaling-stroke"/>`
      : "";
    return `<svg class="shape-paint" viewBox="0 0 100 100" width="100%" height="100%" overflow="visible" preserveAspectRatio="none">${gradient?.defs || ""}${body}${extra}</svg>`;
  }
  root.shapePaintMarkup = shapePaintMarkup;
})(typeof globalThis !== "undefined" ? globalThis : window);
