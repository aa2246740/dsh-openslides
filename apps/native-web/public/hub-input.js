import { t } from "./i18n.js";

const isSha256 = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function parseCatalog(data) {
  if (data?.version !== 1 || !isSha256(data.hash) || !Array.isArray(data.formats) || !Array.isArray(data.styles)) {
    throw new Error(t("设计目录结构或来源校验值无效"));
  }
  if (data.formats.length !== 2 || new Set(data.formats.map((format) => format?.layout)).size !== 2
    || data.formats.some((format) => !record(format) || format.kind !== "Slides" || !["16:9", "4:3"].includes(format.layout))) {
    throw new Error(t("设计目录包含不支持的文档格式"));
  }
  const ids = new Set();
  const styles = data.styles.map((style) => {
    if (!record(style) || !nonempty(style.id) || !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(style.id) || ids.has(style.id) || !nonempty(style.label)
      || style.category !== style.id.split("/")[0] || !nonempty(style.designSourceId)
      || !isSha256(style.designHash) || !Array.isArray(style.previews) || !style.previews.length) {
      throw new Error(t("设计目录存在重复设计或不完整来源信息"));
    }
    ids.add(style.id);
    const sources = new Set();
    const previews = style.previews.map((preview) => {
      if (!record(preview) || !nonempty(preview.sourceId) || sources.has(preview.sourceId) || !isSha256(preview.hash)
        || !Number.isSafeInteger(preview.order) || preview.order < 0
        || preview.url !== `/slides/catalog/previews/${encodeURIComponent(preview.sourceId)}`) {
        throw new Error(t("设计预览来源、校验值或地址无效"));
      }
      sources.add(preview.sourceId);
      return Object.freeze({ ...preview });
    }).sort((a, b) => a.order - b.order);
    return Object.freeze({ ...style, previews: Object.freeze(previews) });
  });
  return Object.freeze({
    version: 1, hash: data.hash,
    formats: Object.freeze(data.formats.map((format) => Object.freeze({ ...format }))),
    styles: Object.freeze(styles),
  });
}

export function buildGenerationRequest({
  catalog, brief, kind, layout, designSystemId, attachments,
  provider, model, reasoningEffort,
}) {
  if (!catalog) throw new Error(t("设计目录尚未加载，暂不能创建文稿"));
  if (!nonempty(brief)) throw new Error(t("请填写文稿要求"));
  if (!catalog.formats.some((format) => format.kind === kind && format.layout === layout)) {
    throw new Error(t("请选择受支持的 Slides 16:9 或 4:3 格式"));
  }
  if (designSystemId && !catalog.styles.some((style) => style.id === designSystemId)) {
    throw new Error(t("所选设计不在当前目录中，请重新选择"));
  }
  const ids = new Set();
  const selected = attachments.map((attachment) => {
    if (attachment.status !== "parsed" || !nonempty(attachment.id)) {
      throw new Error(t("资料“{name}”尚未完整解析，请等待、重试或明确移除", { name: attachment.name || t("未命名") }));
    }
    if (ids.has(attachment.id)) throw new Error(t("同一资料被重复选择"));
    ids.add(attachment.id);
    return Object.freeze({ id: attachment.id });
  });
  if (!nonempty(provider) || !nonempty(model)) throw new Error(t("请选择供应商和模型"));
  return Object.freeze({
    brief: brief.trim(), kind, layout, attachments: Object.freeze(selected), provider, model,
    ...(designSystemId ? { designSystemId } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
  });
}
