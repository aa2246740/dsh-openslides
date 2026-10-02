import type { Agent } from "@deepseek-ai/dsh-agent";
/**
 * Cancel an agent from inside a `session/event` observer.
 *
 * The kernel runs session observers synchronously inside `session.append`'s
 * publish window and rejects a nested append. `agent.cancel()` reaches one via
 * `inbox.clear()` (it appends `agent/inbox/spliced`), so an in-place call
 * throws before `phase.abort` fires — and observer containment swallows the
 * error, leaving the turn running. Deferring to a microtask lands the cancel
 * after the current append completes. A late failure is logged, not lost.
 *
 * @param agent - the live agent handle resolved from `live`/`ctx.agents`.
 * @param sessionId - owning session, for diagnostics.
 * @param reason - abort reason carried on `{ kind: "hook" }`.
 */
export declare function cancelAgentOutsideAppend(agent: Pick<Agent, "cancel">, sessionId: string, reason: string): void;
//# sourceMappingURL=agent-cancel.d.ts.map