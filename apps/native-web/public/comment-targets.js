/** Geometry and identity for annotation picking. Picking never changes slide content. */
export function reviewCacheKey(projectRoot, pagePath) {
  return `oss.comments:v2:${JSON.stringify([String(projectRoot || ""), String(pagePath || "")])}`;
}

export function isAnnotationTarget(element, size) {
  if (!element?.id || element.hidden || element.opacity === 0) return false;
  if (element.type === "text" && typeof element.text === "string" && !element.text.trim()) return false;
  const bounds = element.bounds;
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite)) return false;
  const [x, y, w, h] = bounds;
  if (w <= 0 || h <= 0) return false;
  // A full-slide background/overlay is not an object the user meant to pick by
  // clicking a word or drawing a small rectangle. Whole-page review is explicit.
  if (["shape", "image"].includes(element.type)) {
    const [sw, sh] = size;
    if (x <= sw * .05 && y <= sh * .05 && x + w >= sw * .95 && y + h >= sh * .95) return false;
  }
  return true;
}

export function annotationPoint(clientX, clientY, slideRect, size) {
  const [w, h] = size;
  return [
    Math.max(0, Math.min(w, (clientX - slideRect.left) * w / slideRect.width)),
    Math.max(0, Math.min(h, (clientY - slideRect.top) * h / slideRect.height)),
  ];
}

export function annotationBox(start, end) {
  return [Math.min(start[0], end[0]), Math.min(start[1], end[1]), Math.abs(end[0] - start[0]), Math.abs(end[1] - start[1])];
}

/** Crossing selection: every visible object touched by a non-empty box is selected. */
export function annotationTargetsInBox(elements, box, size) {
  const [left, top, width, height] = box;
  if (width <= 0 || height <= 0) return [];
  return elements.filter((element) => {
    if (!isAnnotationTarget(element, size)) return false;
    const [x, y, w, h] = element.bounds;
    const overlapW = Math.max(0, Math.min(x + w, left + width) - Math.max(x, left));
    const overlapH = Math.max(0, Math.min(y + h, top + height) - Math.max(y, top));
    return overlapW > 0 && overlapH > 0;
  }).map((element) => element.id);
}
