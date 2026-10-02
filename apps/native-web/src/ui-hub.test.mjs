import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { test } from "node:test";
import { parseCatalog, buildGenerationRequest } from "../public/hub-input.js";

const { JSDOM } = createRequire(import.meta.url)("jsdom");
const hash = createHash("sha256").update("UI schema regression fixture, not model evidence").digest("hex");
function catalogData() {
  return {
    version: 1, hash,
    formats: [{ kind: "Slides", layout: "16:9" }, { kind: "Slides", layout: "4:3" }],
    styles: [{
      id: "work/example", label: "Example", category: "work", designSourceId: "design/example", designHash: hash,
      previews: [{ sourceId: "visual/example", hash, url: "/slides/catalog/previews/visual%2Fexample", order: 0 }],
    }],
  };
}
function input(overrides = {}) {
  return {
    catalog: parseCatalog(catalogData()), brief: "文稿要求", kind: "Slides", layout: "16:9",
    attachments: [], provider: "configured-provider", model: "configured-model", ...overrides,
  };
}

test("actual Hub document disables unsupported choices", () => {
  const html = fs.readFileSync(new URL("../public/hub.html", import.meta.url), "utf8");
  const document = new JSDOM(html).window.document;
  for (const selector of ['[data-kind="Docs"]', '[data-kind="Report"]', '[data-layout="Adaptive"]']) {
    assert.equal(document.querySelector(selector).disabled, true);
  }
  for (const selector of ['[data-layout="16:9"]', '[data-layout="4:3"]']) {
    assert.equal(document.querySelector(selector).disabled, false);
  }
});

test("malformed catalog evidence is rejected rather than silently omitted", () => {
  for (const mutate of [
    (data) => { data.hash = "abc"; },
    (data) => { data.hash = [hash]; },
    (data) => { data.styles[0].designHash = [hash]; },
    (data) => { data.styles[0].previews[0].hash = [hash]; },
    (data) => { data.formats[0] = null; },
    (data) => { data.formats[1] = data.formats[0]; },
    (data) => { data.styles[0] = null; },
    (data) => { data.styles[0].previews[0] = null; },
    (data) => { data.styles[0].id = "freestyle"; data.styles[0].category = "freestyle"; },
    (data) => { delete data.styles[0].designHash; },
    (data) => { delete data.styles[0].designSourceId; },
    (data) => { data.styles.push(structuredClone(data.styles[0])); },
    (data) => { data.styles[0].category = "finance"; },
    (data) => { data.styles[0].previews[0].hash = "wrong"; },
    (data) => { data.styles[0].previews[0].url = "https://external.invalid/fake.jpg"; },
    (data) => { data.styles[0].previews = []; },
    (data) => { data.formats.push({ kind: "Docs", layout: "Adaptive" }); },
  ]) {
    const data = catalogData();
    mutate(data);
    assert.throws(() => parseCatalog(data));
  }
});

test("catalog preserves exact source identities and ordered previews", () => {
  const data = catalogData();
  data.styles[0].previews.unshift({ sourceId: "visual/second", hash, order: 1, url: "/slides/catalog/previews/visual%2Fsecond" });
  const catalog = parseCatalog(data);
  assert.equal(catalog.styles[0].id, data.styles[0].id);
  assert.equal(catalog.styles[0].designSourceId, "design/example");
  assert.equal(catalog.styles[0].previews[0].sourceId, "visual/example");
  assert.throws(() => { catalog.styles[0].id = "another/design"; }, TypeError);
});

test("failed, pending and unparsed attachments block creation without dropping selections", () => {
  for (const status of ["uploading", "failed", "recorded", undefined]) {
    const attachments = [{ id: "chosen", status, name: "reference" }];
    assert.throws(() => buildGenerationRequest(input({ attachments })), /完整解析/);
    assert.equal(attachments.length, 1);
  }
  assert.throws(() => buildGenerationRequest(input({ attachments: [{ status: "parsed" }] })), /完整解析/);
});

test("creation retains the exact selected IDs, format, model and design without changing the input", () => {
  const attachments = [{ id: "selected-a", status: "parsed", name: "a" }, { id: "selected-b", status: "parsed", name: "b" }];
  const request = buildGenerationRequest(input({ attachments, layout: "4:3", designSystemId: "work/example", reasoningEffort: "high" }));
  assert.deepEqual(request.attachments, [{ id: "selected-a" }, { id: "selected-b" }]);
  assert.equal(request.layout, "4:3");
  assert.equal(request.designSystemId, "work/example");
  assert.equal(request.provider, "configured-provider");
  assert.equal(request.reasoningEffort, "high");
  attachments[0].id = "changed-later";
  assert.equal(request.attachments[0].id, "selected-a");
  assert.throws(() => { request.layout = "16:9"; }, TypeError);
  assert.equal(Object.hasOwn(buildGenerationRequest(input()), "designSystemId"), false);
});

test("unsupported or incomplete creation intent is rejected without fallback", () => {
  for (const overrides of [
    { catalog: null }, { kind: "Docs" }, { layout: "Adaptive" }, { brief: " " },
    { designSystemId: "wrong/alias" }, { provider: "" }, { model: "" },
    { attachments: [{ id: "same", status: "parsed" }, { id: "same", status: "parsed" }] },
  ]) assert.throws(() => buildGenerationRequest(input(overrides)));
});
