import assert from "node:assert/strict";
import zlib from "node:zlib";
import { describe, it } from "node:test";
import { buildPdfFromPngs, decodePngToRgb } from "./png-pdf.mjs";

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Minimal 8-bit PNG encoder: filter byte 0 per row. */
function makePng(width, height, colorType, fill) {
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  const row = Buffer.alloc(1 + width * channels);
  for (let x = 0; x < width * channels; x += 1) row[1 + x] = fill(x % channels);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  return Buffer.concat([
    SIG,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function imageStreams(pdf) {
  const text = pdf.toString("latin1");
  const out = [];
  const re = /<<\s*\/Type \/XObject[\s\S]*?\/Length (\d+)\s*>>\s*\nstream\n/g;
  for (const m of text.matchAll(re)) {
    const start = m.index + m[0].length;
    out.push({
      dict: m[0],
      bytes: zlib.inflateSync(pdf.subarray(start, start + Number(m[1]))),
    });
  }
  return out;
}

describe("png to pdf", () => {
  it("decodes filtered RGBA PNGs to RGB", () => {
    // Row uses filter 4 (paeth) on a flat image must decode to the flat color.
    const w = 2;
    const h = 1;
    const raw = Buffer.alloc(h * (1 + w * 4));
    raw[0] = 4; // paeth
    raw[1] = 10; raw[2] = 20; raw[3] = 30; raw[4] = 255;
    raw[5] = 0; raw[6] = 0; raw[7] = 0; raw[8] = 255;
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const png = Buffer.concat([
      SIG,
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]);
    const { rgb } = decodePngToRgb(png);
    assert.deepEqual([...rgb.subarray(0, 6)], [10, 20, 30, 10, 20, 30]);
  });

  it("builds a two-page PDF with exact page geometry and pixel streams", () => {
    const pageA = { bytes: makePng(4, 2, 6, (c) => [255, 0, 0, 255][c]), width: 4, height: 2 };
    const pageB = { bytes: makePng(4, 2, 2, (c) => [0, 255, 0][c]), width: 4, height: 2 };
    const pdf = buildPdfFromPngs([pageA, pageB]);
    const text = pdf.toString("latin1");
    assert.ok(text.startsWith("%PDF-1.6"));
    assert.ok(text.trimEnd().endsWith("%%EOF"));
    assert.match(text, /\/Count 2/);
    assert.match(text, /\/MediaBox \[0 0 3 1\.50\]/); // 4px x 2px at 96dpi -> pt
    const streams = imageStreams(pdf);
    assert.equal(streams.length, 2);
    // Predictor 15: each row is one 0x00 filter byte + w*3 bytes.
    assert.equal(streams[0].bytes.length, 2 * (1 + 4 * 3));
    assert.equal(streams[0].bytes[1], 255);
    assert.equal(streams[0].bytes[2], 0);
    assert.equal(streams[1].bytes[2], 255);
    assert.match(streams[0].dict, /\/Predictor 15 \/Colors 3/);
  });

  it("rejects unsupported PNGs and empty input", () => {
    assert.throws(() => buildPdfFromPngs([]), /at least one page/);
    const palette = (() => {
      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(1, 0);
      ihdr.writeUInt32BE(1, 4);
      ihdr[8] = 8;
      ihdr[9] = 3;
      return Buffer.concat([
        SIG,
        chunk("IHDR", ihdr),
        chunk("PLTE", Buffer.from([1, 2, 3])),
        chunk("IDAT", zlib.deflateSync(Buffer.from([0, 0]))),
        chunk("IEND", Buffer.alloc(0)),
      ]);
    })();
    assert.throws(() => decodePngToRgb(palette), /color type 3/);
  });
});
