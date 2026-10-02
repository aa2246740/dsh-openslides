/** Presentation only. Copied from dsh-better-display StreamBuffer timing. */
export const STREAM_TIMING = {
  catchUpMs: 180,
  maxQueuedMs: 240,
  finishMs: 96,
  revealMs: 350,
  minimumRate: 100,
};

const graphemes = typeof Intl !== "undefined" && Intl.Segmenter
  ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
  : null;

function atOrAfter(values, target) {
  let low = 0;
  let high = values.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

export class StreamBuffer {
  constructor(initial = "") {
    this.target = initial;
    this.visible = initial;
    this.revision = 0;
    this.boundaries = [0];
    this.arrivals = [];
    this.lastAt = null;
    this.credit = 0;
    this.finishAt = null;
    this.segment(0);
  }

  get pending() {
    return this.visible.length < this.target.length;
  }

  segment(from) {
    const index = atOrAfter(this.boundaries, from);
    this.boundaries.length = index;
    const slice = this.target.slice(from);
    if (graphemes) {
      for (const part of graphemes.segment(slice)) this.boundaries.push(from + part.index);
    } else {
      for (let i = 0; i < slice.length; i += 1) this.boundaries.push(from + i);
    }
    if (this.boundaries.at(-1) !== this.target.length) this.boundaries.push(this.target.length);
  }

  update(text, now, options = {}) {
    if (options.immediate || !text.startsWith(this.target)) {
      if (text !== this.target) this.revision += 1;
      this.target = text;
      this.flush();
      this.boundaries = [0];
      this.segment(0);
      return;
    }
    if (text !== this.target) {
      const wasPending = this.pending;
      const from = this.boundaries.at(-2) ?? 0;
      this.target = text;
      this.segment(from);
      this.arrivals.push({ end: text.length, at: now });
      if (!wasPending) {
        this.lastAt = now;
        this.credit = 0;
      }
    }
    if (options.finished && this.finishAt === null) this.finishAt = now + STREAM_TIMING.finishMs;
    if (!options.finished) this.finishAt = null;
    if (this.target.length - this.visible.length > 8192) {
      this.revision += 1;
      this.flush();
    }
  }

  flush() {
    this.visible = this.target;
    this.arrivals = [];
    this.credit = 0;
    this.lastAt = null;
    this.finishAt = null;
  }

  advance(now) {
    if (!this.pending) return false;
    const before = this.visible.length;
    const index = atOrAfter(this.boundaries, before);
    const remaining = this.boundaries.length - index - 1;
    const delta = Math.max(0, now - (this.lastAt ?? now));
    this.lastAt = now;
    const windowMs = this.finishAt === null
      ? STREAM_TIMING.catchUpMs
      : Math.max(16, Math.min(STREAM_TIMING.catchUpMs, this.finishAt - now));
    const rate = Math.max(STREAM_TIMING.minimumRate, remaining * 1000 / windowMs);
    this.credit += rate * delta / 1000;
    const count = Math.floor(this.credit);
    this.credit -= count;
    let end = this.boundaries[Math.min(this.boundaries.length - 1, index + count)];
    for (const item of this.arrivals) {
      if (now - item.at < STREAM_TIMING.maxQueuedMs) break;
      end = Math.max(end, this.boundaries[atOrAfter(this.boundaries, item.end)]);
    }
    if (this.finishAt !== null && now >= this.finishAt) end = this.target.length;
    if (end && /[\uD800-\uDBFF]/.test(this.target[end - 1]) && this.finishAt === null) end -= 1;
    end = Math.max(before, end);
    this.visible = this.target.slice(0, end);
    this.arrivals = this.arrivals.filter((item) => item.end > end);
    if (!this.pending) {
      this.credit = 0;
      this.lastAt = null;
    }
    return end !== before;
  }
}
