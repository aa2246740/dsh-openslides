export type ToolName =
  | "think"
  | "plan"
  | "read_file"
  | "list_references"
  | "read_reference"
  | "view_design_reference"
  | "commit_design"
  | "read_design"
  | "research"
  | "write_todo"
  | "compose_deck"
  | "generate_image"
  | "search_image"
  | "write_page"
  | "render_page"
  | "review_page"
  | "review_pages"
  | "render_deck"
  | "review_deck"
  | "wait"
  | "validate"
  | "version_snapshot"
  | "export_pptx";

export type ToolStep = {
  tool: ToolName;
  label: string;
  status: "running" | "completed" | "failed";
  summary?: string;
  /** Expandable body — Think / Plan / Read / Research, never a fake "ok". */
  detail?: string;
};
