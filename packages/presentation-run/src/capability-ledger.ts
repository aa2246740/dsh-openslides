export type CapabilityFate = "preserved" | "dsh-native" | "adapted" | "dev-only";

export type CapabilityLedgerRow = {
  readonly id: string;
  readonly owner: "presentation-run" | "dsh-slides-host" | "dsh" | "agent-harness-fixture";
  readonly fate: CapabilityFate;
  readonly notes: string;
};

/**
 * Existing generate capabilities mapped before any production export is deleted.
 * Silent drops are forbidden.
 */
export const CAPABILITY_LEDGER: readonly CapabilityLedgerRow[] = [
  { id: "open_project", owner: "dsh-slides-host", fate: "adapted", notes: "DSH session binds a PPTD project" },
  { id: "inspect_capabilities", owner: "presentation-run", fate: "preserved", notes: "Replaces Host capability card injection" },
  { id: "list_references", owner: "presentation-run", fate: "adapted", notes: "Exact required/missing chunks first, followed by the full 76-file catalog" },
  { id: "read_reference", owner: "presentation-run", fate: "adapted", notes: "Exact OpenKimi chunk; no HandsPort" },
  { id: "view_design_reference", owner: "presentation-run", fate: "dev-only", notes: "Removed: Pi-era design-preview ceremony; the DSH flow reads design chunks via read_reference" },
  { id: "commit_design", owner: "presentation-run", fate: "adapted", notes: "Agent plan + adopted receipts; refuse kind/theme pack disagreement and empty adopt for board-h1/product-intro/academic; no host preset id" },
  { id: "write_todo", owner: "presentation-run", fate: "adapted", notes: "Same plan commit as commit_design; refuse kind/theme pack disagreement" },
  { id: "write_page", owner: "presentation-run", fate: "preserved", notes: "PPTD v2 write; chart evidence gate; skip identical; refuse kind/theme pack disagreement" },
  { id: "render_page", owner: "presentation-run", fate: "preserved", notes: "Native #slide raster" },
  { id: "review_page", owner: "presentation-run", fate: "preserved", notes: "Current-revision visual verdict" },
  { id: "review_pages", owner: "presentation-run", fate: "preserved", notes: "Structural / layout review" },
  { id: "render_deck", owner: "presentation-run", fate: "dev-only", notes: "Removed: Pi-era deck montage ceremony; review_pages is the deck gate" },
  { id: "review_deck", owner: "presentation-run", fate: "dev-only", notes: "Removed: Pi-era nine-axis taste review; review_pages is the deck gate" },
  { id: "compose_deck", owner: "presentation-run", fate: "preserved", notes: "Compose gate; refuse kind/theme pack disagreement; no host paint" },
  { id: "export_deck", owner: "presentation-run", fate: "preserved", notes: "Hybrid native PPTX" },
  { id: "think", owner: "dsh", fate: "dsh-native", notes: "DSH agent loop / persona" },
  { id: "plan", owner: "dsh", fate: "dsh-native", notes: "DSH goal/plan rows remain in kernel" },
  { id: "research", owner: "dsh", fate: "dsh-native", notes: "DSH web seam when configured" },
  { id: "web_search", owner: "presentation-run", fate: "preserved", notes: "Grok hosted xAI web_search; advertised only when pi-xai is ready" },
  { id: "search_image", owner: "presentation-run", fate: "preserved", notes: "Optional; advertised only when configured (env port or pi-xai-hosted)" },
  { id: "generate_image", owner: "presentation-run", fate: "preserved", notes: "Optional; advertised only when configured" },
  { id: "createPiBrain", owner: "agent-harness-fixture", fate: "dev-only", notes: "Not on the product generate path" },
  { id: "resolvePlaybookCategory", owner: "agent-harness-fixture", fate: "dev-only", notes: "Removed from Hub/DSH generate" },
  { id: "resolveGenerateDesign", owner: "agent-harness-fixture", fate: "dev-only", notes: "Removed from Hub/DSH generate" },
  { id: "host-produce", owner: "agent-harness-fixture", fate: "dev-only", notes: "Must not appear in production graph" },
];

export function ledgerFate(id: string): CapabilityLedgerRow | undefined {
  return CAPABILITY_LEDGER.find((row) => row.id === id);
}
