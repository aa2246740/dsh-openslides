import { BarChart3, Database, Type, Workflow } from "lucide-react";
import type { ChartElement, SmartArtElement, SlideElement } from "@open-slidestudio/pptd";
import { useAppStore } from "../../store/app-store";

/**
 * Context toolbar when an element is selected (PRD §5.5 / frame 12).
 */
export function SelectionToolbar({
  element,
  disabled,
}: {
  element: SlideElement;
  disabled?: boolean;
}) {
  const setChartOpen = useAppStore((s) => s.setChartDataEditorOpen);
  const chartOpen = useAppStore((s) => s.chartDataEditorOpen);
  const updateSmartArt = useAppStore((s) => s.updateSelectedSmartArtNodes);
  const updateText = useAppStore((s) => s.updateSelectedText);
  const showToast = useAppStore((s) => s.showToast);

  if (element.kind === "chart") {
    const chart = element as ChartElement;
    return (
      <div className="selection-toolbar" role="toolbar" aria-label="Chart tools">
        <span className="selection-toolbar__label">
          <BarChart3 size={14} /> Chart
        </span>
        <button
          type="button"
          className="btn-secondary"
          style={{ minHeight: 30, padding: "0 10px" }}
          disabled={disabled}
          aria-pressed={chartOpen}
          onClick={() => setChartOpen(!chartOpen)}
        >
          <Database size={14} style={{ marginRight: 4 }} />
          Data
        </button>
        <span className="muted" style={{ fontSize: 12 }}>
          {chart.categories.length} cats · {chart.series.length} series
        </span>
      </div>
    );
  }

  if (element.kind === "smartart") {
    const sa = element as SmartArtElement;
    return (
      <div className="selection-toolbar" role="toolbar" aria-label="SmartArt tools">
        <span className="selection-toolbar__label">
          <Workflow size={14} /> SmartArt · {sa.layout}
        </span>
        <button
          type="button"
          className="btn-secondary"
          style={{ minHeight: 30, padding: "0 10px" }}
          disabled={disabled}
          onClick={() => {
            const text = window.prompt(
              "Edit nodes (one per line)",
              sa.nodes.map((n) => n.text).join("\n"),
            );
            if (text == null) return;
            const lines = text
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean);
            if (!lines.length) return;
            const nodes = lines.map((line, i) => ({
              id: sa.nodes[i]?.id ?? `n${i + 1}`,
              text: line,
              parentId: i === 0 ? null : sa.nodes[i - 1]?.id ?? `n${i}`,
              style: sa.nodes[i]?.style,
            }));
            updateSmartArt(nodes);
            showToast("SmartArt nodes updated", "success");
          }}
        >
          <Type size={14} style={{ marginRight: 4 }} />
          Edit nodes
        </button>
        <span className="muted" style={{ fontSize: 12 }}>
          {sa.nodes.length} nodes
        </span>
      </div>
    );
  }

  if (element.kind === "text") {
    return (
      <div className="selection-toolbar" role="toolbar" aria-label="Text tools">
        <span className="selection-toolbar__label">
          <Type size={14} /> Text
        </span>
        <span className="muted" style={{ fontSize: 12 }}>
          Edit below · arrows nudge
        </span>
        <button
          type="button"
          className="btn-secondary"
          style={{ minHeight: 30, padding: "0 10px" }}
          disabled={disabled}
          onClick={() => {
            const current =
              element.paragraphs[0]?.runs.map((r) => r.text).join("") ?? "";
            const next = window.prompt("Text", current);
            if (next != null) updateText(next);
          }}
        >
          Edit…
        </button>
      </div>
    );
  }

  return (
    <div className="selection-toolbar" role="toolbar" aria-label="Element tools">
      <span className="selection-toolbar__label">{element.kind}</span>
      <span className="muted" style={{ fontSize: 12 }}>
        {element.name || element.id}
      </span>
    </div>
  );
}
