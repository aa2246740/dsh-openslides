// RC2 isolated-Host probe: asserts the slides agent plane wires ONLY onto
// agents whose composed preset is "slides" and never leaks onto standard agents.
// Injected into the boot patch by run.mjs; reads DSH_RC2_HOST for the registry
// module URL and PROBE_CWD for a writable agent cwd.
export const name = "dps-probe";
export const inject = ["tools", "agents"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RUN = Date.now().toString(36);

export async function apply(ctx) {
  const regUrl = `file://${process.env.DSH_RC2_HOST}/node_modules/@deepseek-ai/dsh-agent-preset-registry/lib/index.js`;
  const reg = await import(regUrl);
  const { livePresetMounts, standingMountFor } = reg;
  const probeCwd = process.env.PROBE_CWD ?? "/tmp";
  ctx.on("agent/created", ({ agent }) => {
    const mount = standingMountFor(agent.ctx);
    const presets = ctx.get("agentPresets");
    console.log(`[probe] created agent=${agent.id} composedPreset=${presets?.composedPreset?.(agent.ctx)} mount=${mount?.presetId} genCtxHasTools=${mount ? typeof mount.fiber.ctx.get("tools") : "n/a"}`);
    const tools = ctx.get("tools");
    console.log(`[probe] post-wire schemas=${JSON.stringify(tools.schemas(agent).map((t) => t.name))}`);
    return undefined;
  });
  ctx.effect(() => {
    const run = async () => {
      await sleep(4000);
      const presets = ctx.get("agentPresets");
      try {
        const list = await presets?.list?.();
        console.log("[probe] presets:", JSON.stringify(list?.map((p) => ({ id: p.id, name: p.name, broken: p.broken })) ?? list));
      } catch (e) {
        console.log("[probe] roster error:", e?.message);
      }
      const report = async (tag, agent) => {
        const tools = ctx.get("tools");
        console.log(`[probe] ${tag} composedPreset=${presets?.composedPreset?.(agent.ctx)} mounts=${livePresetMounts.size}`);
        const names = tools.schemas(agent).map((t) => t.name);
        console.log(`[probe] ${tag} tools=[${names.join(",")}]`);
        for (const t of [
          { name: "open_project", arguments: { title: `Probe ${tag}` } },
          { name: "bash", arguments: { command: "echo hi" } },
        ]) {
          try {
            const r = await tools.execute({
              callId: `probe-${tag}-${t.name}`,
              name: t.name,
              arguments: t.arguments,
              agent,
              signal: new AbortController().signal,
            });
            console.log(`[probe] ${tag} ${t.name}: ${JSON.stringify(r).slice(0, 200)}`);
          } catch (e) {
            console.log(`[probe] ${tag} ${t.name} threw: ${e?.message}`);
          }
        }
      };
      try {
        const slides = await ctx.agents.create({
          sessionId: `session-probe-slides-${RUN}`,
          meta: { agentPreset: "slides", cwd: probeCwd },
          setup: async (agentCtx) => { await presets.mount(agentCtx, "slides"); },
        });
        await report("slides-agent", slides.agent);
        await slides.dispose().catch(() => undefined);
      } catch (e) {
        console.log("[probe] slides agent create failed:", e?.message);
      }
      try {
        const normal = await ctx.agents.create({
          sessionId: `session-probe-normal-${RUN}`,
          meta: { agentPreset: "standard", cwd: probeCwd },
          setup: async (agentCtx) => { await presets.mount(agentCtx, "standard"); },
        });
        await report("normal-agent", normal.agent);
        await normal.dispose().catch(() => undefined);
      } catch (e) {
        console.log("[probe] normal agent create failed:", e?.message);
      }
      console.log("[probe] done");
    };
    run().catch((e) => console.log("[probe] fatal:", e?.message, e?.stack));
  });
}
