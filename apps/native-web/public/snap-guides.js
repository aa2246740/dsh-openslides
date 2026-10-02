/**
 * Selection snap / animation grouping used by the native editor.
 * Loaded by the editor (script tag) and by unit tests — keep this the
 * only place that decides guide positions and trigger groups.
 */
(function (root) {
  function edges(b) {
    const [x, y, w, h] = b;
    return {
      left: x,
      right: x + w,
      cx: x + w / 2,
      top: y,
      bottom: y + h,
      cy: y + h / 2,
    };
  }

  function computeSnapGuides(moving, others, threshold, pageSize) {
    const tol = typeof threshold === "number" ? threshold : 6;
    const refs = others ? others.slice() : [];
    if (pageSize && pageSize.length >= 2) {
      refs.unshift([0, 0, pageSize[0], pageSize[1]]);
    }
    const m = edges(moving);
    let bestX = { dist: tol + 1, delta: 0, pos: null, kind: "edge" };
    let bestY = { dist: tol + 1, delta: 0, pos: null, kind: "edge" };

    const considerX = (from, to, kind) => {
      const dist = Math.abs(from - to);
      if (dist < bestX.dist) bestX = { dist, delta: to - from, pos: to, kind };
    };
    const considerY = (from, to, kind) => {
      const dist = Math.abs(from - to);
      if (dist < bestY.dist) bestY = { dist, delta: to - from, pos: to, kind };
    };

    for (const o of refs) {
      if (!o || o.length < 4) continue;
      const e = edges(o);
      considerX(m.left, e.left, "edge");
      considerX(m.left, e.cx, "center");
      considerX(m.left, e.right, "edge");
      considerX(m.cx, e.left, "center");
      considerX(m.cx, e.cx, "center");
      considerX(m.cx, e.right, "center");
      considerX(m.right, e.left, "edge");
      considerX(m.right, e.cx, "center");
      considerX(m.right, e.right, "edge");
      considerY(m.top, e.top, "edge");
      considerY(m.top, e.cy, "center");
      considerY(m.top, e.bottom, "edge");
      considerY(m.cy, e.top, "center");
      considerY(m.cy, e.cy, "center");
      considerY(m.cy, e.bottom, "center");
      considerY(m.bottom, e.top, "edge");
      considerY(m.bottom, e.cy, "center");
      considerY(m.bottom, e.bottom, "edge");
    }

    const guides = [];
    let dx = 0;
    let dy = 0;
    if (bestX.pos != null) {
      dx = bestX.delta;
      guides.push({ axis: "x", pos: bestX.pos, kind: bestX.kind });
    }
    if (bestY.pos != null) {
      dy = bestY.delta;
      guides.push({ axis: "y", pos: bestY.pos, kind: bestY.kind });
    }
    return {
      guides,
      snap: [moving[0] + dx, moving[1] + dy, moving[2], moving[3]],
    };
  }

  function animationGroups(anims) {
    const groups = [];
    for (const a of anims || []) {
      if (!a || a.effect === "none") continue;
      if ((a.trigger === "withPrevious" || a.trigger === "with-previous") && groups.length) {
        groups[groups.length - 1].push(a);
      } else {
        groups.push([a]);
      }
    }
    return groups;
  }

  function staggerDelays(anims, stepMs) {
    const step = typeof stepMs === "number" ? stepMs : 70;
    const list = anims || [];
    const groups = animationGroups(list);
    const delayOf = new Map();
    let cursor = 0;
    for (const g of groups) {
      const base =
        g[0]?.trigger === "afterPrevious" || g[0]?.trigger === "after-previous"
          ? cursor
          : (g[0]?.delayMs ?? cursor);
      g.forEach((a, i) => {
        delayOf.set(a, base + i * step);
      });
      const last = g[g.length - 1];
      cursor = (delayOf.get(last) || 0) + (last.durationMs || 400);
    }
    return list.map((a) => ({
      ...a,
      delayMs: delayOf.has(a) ? delayOf.get(a) : a.delayMs || 0,
      durationMs: a.durationMs || 400,
    }));
  }

  function isDarkCss(css) {
    const hex = String(css || "").match(/#([0-9a-f]{3,8})/i);
    if (!hex) {
      const rgb = String(css || "").match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (!rgb) return false;
      const r = Number(rgb[1]);
      const g = Number(rgb[2]);
      const b = Number(rgb[3]);
      return (r * 299 + g * 587 + b * 114) / 1000 < 140;
    }
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 < 140;
  }

  root.computeSnapGuides = computeSnapGuides;
  root.animationGroups = animationGroups;
  root.staggerDelays = staggerDelays;
  root.isDarkCss = isDarkCss;
})(typeof globalThis !== "undefined" ? globalThis : window);
