import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AgentFaults } from "./agent-fault.js";
import { createSlidesProduceSetup, hostedProduceToolDefinitions } from "./produce-agent-setup.js";
import { SliceSessionStore } from "./slice-session.js";
/**
 * Session 3612938f: host-forced product web_search in agent/pre-step aborted
 * (`hosted web_search failed: This operation was aborted`) and killed generate
 * before write_page. Grok search belongs on dsh-oauth native hosted tools.
 */
function stubPresentation() {
    return {
        execute: async () => {
            throw new Error("force-hosted sidecar must not run");
        },
        open: async () => {
            throw new Error("unused");
        },
        inspect: async () => {
            throw new Error("unused");
        },
        hydrate: () => undefined,
        epochFor: () => "epoch",
    };
}
function stubDeps() {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "no-force-search-"));
    return {
        store: new SliceSessionStore(workspace),
        presentation: stubPresentation(),
        workspaceRoot: workspace,
        editorBaseUrl: "http://127.0.0.1:55200",
        faults: new AgentFaults(),
        provider: { providerId: "pi-xai", modelId: "grok-4.6" },
    };
}
describe("Grok produce does not force product web_search", () => {
    it("does not attach agent/pre-step sidecar search that can abort the generate", async () => {
        const attached = [];
        const hostCtx = {
            get() {
                return undefined;
            },
        };
        const agentCtx = {
            tools: {
                register(_def) {
                    return () => undefined;
                },
            },
            on(name) {
                attached.push(name);
                return () => undefined;
            },
            get() {
                return undefined;
            },
        };
        await createSlidesProduceSetup(hostCtx, stubDeps())(agentCtx, { id: "slides-agent" });
        assert.equal(attached.includes("system-prompt/assemble"), true, attached.join(","));
        assert.deepEqual(hostedProduceToolDefinitions(stubDeps()).map((def) => def.name), ["search_image", "generate_image"]);
    });
});
//# sourceMappingURL=force-hosted-web-search.test.js.map