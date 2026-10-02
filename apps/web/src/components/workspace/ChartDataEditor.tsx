import { useMemo } from "react";
import { X } from "lucide-react";
import type { ChartElement } from "@open-slidestudio/pptd";
import { useAppStore } from "../../store/app-store";

/**
 * Floating chart data editor — PRD §5.6 / frames 12–13.
 * Edits categories + first series values; live via updateChartData.
 */
export function ChartDataEditor({ chart }: { chart: ChartElement }) {
  const open = useAppStore((s) => s.chartDataEditorOpen);
  const setOpen = useAppStore((s) => s.setChartDataEditorOpen);
  const update = useAppStore((s) => s.updateSelectedChart);
  const readonly = useAppStore((s) => s.viewingVersionId) != null;

  const series0 = chart.series[0];
  const rows = useMemo(() => {
    const cats = chart.categories;
    const vals = series0?.values ?? [];
    const n = Math.max(cats.length, vals.length, 1);
    return Array.from({ length: n }, (_, i) => ({
      category: cats[i] ?? "",
      value: vals[i] ?? 0,
    }));
  }, [chart.categories, series0?.values]);

  if (!open) return null;

  const setCategory = (index: number, text: string) => {
    const categories = rows.map((r, i) => (i === index ? text : r.category));
    update({ categories });
  };

  const setValue = (index: number, raw: string) => {
    const num = Number(raw);
    if (raw !== "" && Number.isNaN(num)) return;
    const values = rows.map((r, i) => (i === index ? (raw === "" ? 0 : num) : r.value));
    const series =
      chart.series.length > 0
        ? chart.series.map((s, si) =>
            si === 0 ? { ...s, values } : { ...s, values: s.values.slice() },
          )
        : [{ name: "Series", values }];
    update({ series });
  };

  const addRow = () => {
    const categories = [...chart.categories, `Item ${chart.categories.length + 1}`];
    const series = chart.series.map((s) => ({
      ...s,
      values: [...s.values, 0],
    }));
    if (!series.length) {
      update({
        categories,
        series: [{ name: "Series", values: categories.map(() => 0) }],
      });
      return;
    }
    update({ categories, series });
  };

  const removeRow = (index: number) => {
    if (chart.categories.length <= 1) return;
    const categories = chart.categories.filter((_, i) => i !== index);
    const series = chart.series.map((s) => ({
      ...s,
      values: s.values.filter((_, i) => i !== index),
    }));
    update({ categories, series });
  };

  return (
    <div className="chart-data-editor" role="dialog" aria-label="Chart data">
      <div className="chart-data-editor__header">
        <strong>Chart data</strong>
        <span className="muted" style={{ fontSize: 12 }}>
          {chart.chartType} · live update
        </span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Close data editor"
          onClick={() => setOpen(false)}
        >
          <X size={16} />
        </button>
      </div>
      <div className="chart-data-editor__body">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>{series0?.name || "Value"}</th>
              <th aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td>
                  <input
                    value={row.category}
                    disabled={readonly}
                    onChange={(e) => setCategory(i, e.target.value)}
                    aria-label={`Category ${i + 1}`}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={row.value}
                    disabled={readonly}
                    onChange={(e) => setValue(i, e.target.value)}
                    aria-label={`Value ${i + 1}`}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ minHeight: 28, padding: "0 8px" }}
                    disabled={readonly || rows.length <= 1}
                    onClick={() => removeRow(i)}
                  >
                    −
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="chart-data-editor__actions">
          <button
            type="button"
            className="btn-secondary"
            disabled={readonly}
            onClick={addRow}
          >
            Add row
          </button>
          <label className="chart-type-select">
            Type
            <select
              value={chart.chartType}
              disabled={readonly}
              onChange={(e) =>
                update({ chartType: e.target.value as ChartElement["chartType"] })
              }
            >
              {(["column", "bar", "line", "area", "pie", "doughnut"] as const).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}

