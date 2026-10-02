import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCanonicalPagePlan } from "./page-plan.js";
const page = {
    pageId: "pages/01_cover.page", title: "One idea", layoutFamily: "content", exhibits: [],
};
test("a complete single-page plan preserves its metadata and canonical identity", () => {
    const before = JSON.stringify(page);
    const plan = parseCanonicalPagePlan([page]);
    assert.deepEqual(plan, [{ ...page, pageId: "1_cover" }]);
    assert.equal(JSON.stringify(page), before);
});
test("absent and ID-only metadata is never synthesized into a complete plan", () => {
    for (const value of [undefined, [], [{ pageId: "1_cover" }], [{ ...page, title: "" }],
        [{ ...page, layoutFamily: undefined }], [{ ...page, exhibits: undefined }]]) {
        assert.throws(() => parseCanonicalPagePlan(value));
    }
});
test("two raw IDs cannot silently collapse into one planned page", () => {
    assert.throws(() => parseCanonicalPagePlan([page, { ...page, pageId: "1_cover" }]), /duplicate canonical/);
});
test("exhibits are validated rather than guessed, coerced or silently filtered", () => {
    for (const exhibits of [["chart"], [42], [{ kind: "photo" }], ["none", "chart:bar"]]) {
        assert.throws(() => parseCanonicalPagePlan([{ ...page, exhibits }]));
    }
    assert.deepEqual(parseCanonicalPagePlan([{ ...page, exhibits: ["table", "photo"] }])[0]?.exhibits, ["table", "photo"]);
});
//# sourceMappingURL=page-plan.test.js.map