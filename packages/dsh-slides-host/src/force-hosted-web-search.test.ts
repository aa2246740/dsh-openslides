import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import type { ToolDefinition, ToolRuntime } from "@deepseek-ai/dsh-tools";
import { AgentFaults } from "./agent-fault.js";
import { createSlidesProduceSetup, hostedProduceToolDefinitions } from "./produce-agent-setup.js";
import { SliceSessionStore } from "./slice-session.js";
import type { SliceToolDeps } from "./tools.js";
import type { PresentationRun } from "@open-slidestudio/presentation-run";

/**
 * Session 3612938f: host-forced product web_search in agent/pre-step aborted
 * (`hosted web_search failed: This operation was aborted`) and killed generate
 * before write_page. Grok search belongs on dsh-oauth native hosted tools.
 */
function stubPresentation(): PresentationRun {
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

function stubDeps(): SliceToolDeps {
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
    const attached: string[] = [];
    const hostCtx = {
      get() {
        return undefined;
      },
    } as unknown as Context;
    const agentCtx = {
      tools: {
        register(_def: ToolDefinition) {
          return () => undefined;
        },
      } as unknown as ToolRuntime,
      on(name: string) {
        attached.push(name);
        return () => undefined;
      },
      get() {
        return undefined;
      },
    } as unknown as Context;
    await createSlidesProduceSetup(hostCtx, stubDeps())(agentCtx, { id: "slides-agent" } as never);
    assert.equal(attached.includes("system-prompt/assemble"), true, attached.join(","));
    assert.deepEqual(
      hostedProduceToolDefinitions(stubDeps()).map((def) => def.name),
      ["search_image", "generate_image"],
    );
  });
});
