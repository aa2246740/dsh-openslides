/**
 * Minimal PDF writer: one full-bleed page image per slide, from PNG buffers.
 * Slides are exported as native editor screenshots, so the PDF is the picture
 * — no font substitution, exactly what the editor showed. Zero dependencies:
 * Node zlib handles PNG decode (inflate + defilter) and PDF re-encode
 * (FlateDecode with Predictor 15, the same row-filter scheme PNG uses).
 */
import zlib from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function chunk_type(buf, off) {
  return buf.toString("ascii", off + 4, off + 8);
}

/** Decode an 8-bit, non-interlaced PNG into raw RGB pixels. */
export function decodePngToRgb(bytes) {
  if (bytes.length < 57 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("not a PNG buffer");
  }
  let width = 0;
  let height = 0;
  let colorType = -1;
  let bitDepth = -1;
  let interlace = -1;
  const idat = [];
  let off = 8;
  while (off + 12 <= bytes.length) {
    const len = bytes.readUInt32BE(off);
    const type = chunk_type(bytes, off);
    const data = bytes.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    off += 12 + len;
  }
  if (!width || !height) throw new Error("PNG has no IHDR dimensions");
  if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth} (need 8)`);
  if (interlace !== 0) throw new Error("interlaced PNG is not supported");
  const channelsByColorType = { 0: 1, 2: 3, 3: 0, 4: 2, 6: 4 };
  const channels = channelsByColorType[colorType];
  if (!channels) throw new Error(`unsupported PNG color type ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  if (raw.length < height * (stride + 1)) {
    throw new Error("PNG pixel data is truncated");
  }
  // Defilter in place per PNG spec (filters: none/sub/up/average/paeth).
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    const prev = row - stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[src + x];
      const left = x >= channels ? pixels[row + x - channels] : 0;
      const up = y > 0 ? pixels[prev + x] : 0;
      const ul = y > 0 && x >= channels ? pixels[prev + x - channels] : 0;
      let out = value;
      if (filter === 1) out = value + left;
      else if (filter === 2) out = value + up;
      else if (filter === 3) out = value + ((left + up) >> 1);
      else if (filter === 4) out = value + paeth(left, up, ul);
      pixels[row + x] = out & 0xff;
    }
  }
  // Normalize every color type to opaque DeviceRGB.
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0, j = 0; i < width * height; i += 1, j += 3) {
    if (colorType === 2) {
      rgb[j] = pixels[i * 3];
      rgb[j + 1] = pixels[i * 3 + 1];
      rgb[j + 2] = pixels[i * 3 + 2];
    } else if (colorType === 6) {
      rgb[j] = pixels[i * 4];
      rgb[j + 1] = pixels[i * 4 + 1];
      rgb[j + 2] = pixels[i * 4 + 2];
    } else if (colorType === 0) {
      rgb[j] = pixels[i];
      rgb[j + 1] = pixels[i];
      rgb[j + 2] = pixels[i];
    } else {
      rgb[j] = pixels[i * 2];
      rgb[j + 1] = pixels[i * 2];
      rgb[j + 2] = pixels[i * 2];
    }
  }
  return { width, height, rgb };
}

function pdfNumber(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/**
 * Build a single PDF from full-bleed page images.
 * @param {Array<{ bytes: Buffer, width: number, height: number }>} pages
 * @returns {Buffer}
 */
export function buildPdfFromPngs(pages) {
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error("pdf export needs at least one page image");
  }
  const images = pages.map(({ bytes, width, height }) => {
    const decoded = decodePngToRgb(bytes);
    if (width && height && (decoded.width !== width || decoded.height !== height)) {
      throw new Error(`PNG size ${decoded.width}x${decoded.height} does not match slide ${width}x${height}`);
    }
    // Predictor 15 = PNG row filters; all-zero predictor bytes per row.
    const row = decoded.width * 3;
    const filtered = Buffer.alloc(decoded.height * (row + 1));
    for (let y = 0; y < decoded.height; y += 1) {
      filtered[y * (row + 1)] = 0;
      decoded.rgb.copy(filtered, y * (row + 1) + 1, y * row, (y + 1) * row);
    }
    return {
      width: decoded.width,
      height: decoded.height,
      stream: zlib.deflateSync(filtered, { level: 9 }),
    };
  });

  const objects = [];
  const push = (body) => {
    objects.push(Buffer.from(body, "utf8"));
    return objects.length; // 1-based object number
  };
  const pushStream = (dict, stream) => {
    objects.push(Buffer.concat([
      Buffer.from(`${dict}\nstream\n`, "utf8"),
      stream,
      Buffer.from("\nendstream", "utf8"),
    ]));
    return objects.length;
  };

  const catalogNum = push("<< /Type /Catalog >>"); // 1
  const pagesNum = push("<< /Type /Pages >>"); // 2, kids patched below
  const ptW = [];
  const kidRefs = [];
  for (let i = 0; i < images.length; i += 1) {
    const img = images[i];
    const wpt = (img.width * 72) / 96;
    const hpt = (img.height * 72) / 96;
    ptW.push([wpt, hpt]);
    const content = `q\n${pdfNumber(wpt)} 0 0 ${pdfNumber(hpt)} 0 0 cm\n/Im${i} Do\nQ`;
    const contentNum = pushStream(`<< /Length ${Buffer.byteLength(content)} >>`, Buffer.from(content, "utf8"));
    const imageNum = pushStream(
      `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode ` +
        `/DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${img.width} >> ` +
        `/Length ${img.stream.length} >>`,
      img.stream,
    );
    const pageNum = push(
      `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${pdfNumber(wpt)} ${pdfNumber(hpt)}] ` +
        `/Resources << /XObject << /Im${i} ${imageNum} 0 R >> >> /Contents ${contentNum} 0 R >>`,
    );
    kidRefs.push(`${pageNum} 0 R`);
  }
  const infoNum = push(
    `<< /Producer (Open SlideStudio) /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}Z) >>`,
  );
  objects[pagesNum - 1] = Buffer.from(
    `<< /Type /Pages /Count ${images.length} /Kids [${kidRefs.join(" ")}] >>`,
    "utf8",
  );
  objects[catalogNum - 1] = Buffer.from(
    `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`,
    "utf8",
  );

  const header = Buffer.from("%PDF-1.6\n%\xE2\xE3\xCF\xD3\n", "latin1");
  const chunks = [header];
  const offsets = [0];
  let position = header.length;
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(position);
    const body = objects[i];
    chunks.push(Buffer.from(`${i + 1} 0 obj\n`, "utf8"), body, Buffer.from("\nendobj\n", "utf8"));
    position += 10 + body.length + 9 + String(i + 1).length;
  }
  const xrefStart = position;
  const xrefLines = ["xref", `0 ${objects.length + 1}`, "0000000000 65535 f "];
  for (let i = 1; i <= objects.length; i += 1) {
    xrefLines.push(`${String(offsets[i]).padStart(10, "0")} 00000 n `);
  }
  const trailer =
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogNum} 0 R /Info ${infoNum} 0 R >>\n` +
    `startxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(Buffer.from(`${xrefLines.join("\n")}\n${trailer}`, "utf8"));
  return Buffer.concat(chunks);
}
