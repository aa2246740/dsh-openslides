import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const ATTACHMENT_TEXT_LIMIT = 48_000;
const textExtensions = new Set([".txt", ".md", ".csv", ".tsv", ".json"]);
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");

export function decodeAttachmentUpload(data) {
  if (typeof data !== "string") throw new Error("upload data must be a base64 string");
  const b64 = data.startsWith("data:") ? data.slice(data.indexOf(",") + 1) : data;
  if ((data.startsWith("data:") && !/^data:[^,]*;base64,/.test(data))
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(b64)) {
    throw new Error("invalid base64 upload");
  }
  const bytes = Buffer.from(b64, "base64");
  if (bytes.toString("base64") !== b64) throw new Error("noncanonical base64 upload");
  return bytes;
}

export function parseAttachmentBuffer(name, bytes) {
  if (!textExtensions.has(path.extname(name).toLowerCase())) {
    return { parsed: false, note: "当前仅能完整读取 UTF-8 的 txt、md、csv、tsv、json 文件，请转换后重传" };
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { parsed: false, note: "资料不是有效的 UTF-8 文本，未替换或丢弃任何字符" };
  }
  if (!text.trim()) return { parsed: false, note: "资料正文为空" };
  if (text.length > ATTACHMENT_TEXT_LIMIT) {
    return { parsed: false, note: `资料超过 ${ATTACHMENT_TEXT_LIMIT} 字符，请明确拆分后重传；内容未被截断` };
  }
  return {
    parsed: true, complete: true, parser: "utf8-full-v1", text, chars: text.length,
    originalSha256: digest(bytes), textSha256: digest(text),
  };
}

export function attachmentPublic(record) {
  const { text, ...metadata } = record;
  return metadata;
}

export class AttachmentStore {
  constructor(root) {
    this.root = path.resolve(root);
    this.storeId = digest(this.root);
  }

  paths(id) {
    if (typeof id !== "string" || !/^[a-f0-9-]{36}-[a-zA-Z0-9._\u4e00-\u9fff-]{1,80}$/.test(id)) {
      throw new Error("资料 ID 无效");
    }
    return { original: path.join(this.root, id), metadata: path.join(this.root, `${id}.meta.json`) };
  }

  regularFile(file) {
    if (fs.lstatSync(this.root).isSymbolicLink()) throw new Error("上传存储目录不能是符号链接");
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("资料必须是上传存储中的普通文件，不能是符号链接");
    if (path.dirname(fs.realpathSync(file)) !== fs.realpathSync(this.root)) throw new Error("资料超出上传存储边界");
    return fs.readFileSync(file);
  }

  store(name, bytes) {
    const parsed = parseAttachmentBuffer(name, bytes);
    if (!parsed.parsed) throw new Error(parsed.note);
    fs.mkdirSync(this.root, { recursive: true });
    if (fs.lstatSync(this.root).isSymbolicLink()) throw new Error("上传存储目录不能是符号链接");
    let safe = path.basename(name).replace(/[^a-zA-Z0-9._\u4e00-\u9fff-]+/g, "_").slice(0, 80) || "file";
    while (Buffer.byteLength(safe, "utf8") > 180) safe = Array.from(safe).slice(0, -1).join("");
    const id = `${crypto.randomUUID()}-${safe}`;
    const record = { id, name: path.basename(name), bytes: bytes.length, storeId: this.storeId, ...parsed };
    const files = this.paths(id);
    fs.writeFileSync(files.original, bytes, { flag: "wx" });
    try {
      fs.writeFileSync(files.metadata, `${JSON.stringify(attachmentPublic(record))}\n`, { flag: "wx" });
    } catch (error) {
      fs.unlinkSync(files.original);
      throw error;
    }
    return record;
  }

  read(id) {
    const files = this.paths(id);
    if (!fs.existsSync(files.metadata)) return undefined;
    const metadata = JSON.parse(this.regularFile(files.metadata).toString("utf8"));
    if (metadata.id !== id || metadata.storeId !== this.storeId) throw new Error("资料不属于当前上传存储");
    if (metadata.ownerId !== undefined) throw new Error("资料带有未验证的 owner，不能用于当前创建请求");
    const bytes = this.regularFile(files.original);
    if (bytes.length !== metadata.bytes || digest(bytes) !== metadata.originalSha256) throw new Error("资料原文件已变化，请重新上传");
    const parsed = parseAttachmentBuffer(metadata.name, bytes);
    if (!parsed.parsed || metadata.parsed !== true || metadata.complete !== true || metadata.chars !== parsed.chars
      || metadata.parser !== parsed.parser || metadata.textSha256 !== parsed.textSha256) {
      throw new Error("资料完整解析凭据无效，请重新上传");
    }
    return { id: metadata.id, name: metadata.name, bytes: bytes.length, storeId: this.storeId, ...parsed };
  }

  delete(id) {
    if (!this.read(id)) return false;
    const files = this.paths(id);
    fs.unlinkSync(files.original);
    fs.unlinkSync(files.metadata);
    return true;
  }
}
