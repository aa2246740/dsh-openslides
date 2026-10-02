import { useState } from "react";
import { Download, FileImage, FileSpreadsheet, FileText, Loader2, X } from "lucide-react";
import { exportDeckToPptx } from "@open-slidestudio/exporter-pptx";
import { useAppStore } from "../../store/app-store";
import { downloadBlob } from "../../lib/download";
import { exportDeckPdf, exportDeckPngs } from "../../lib/export-raster";

export function ExportModal() {
  const open = useAppStore((s) => s.exportModalOpen);
  const setOpen = useAppStore((s) => s.setExportModalOpen);
  const deck = useAppStore((s) => s.deck);
  const exporting = useAppStore((s) => s.exporting);
  const setExporting = useAppStore((s) => s.setExporting);
  const showToast = useAppStore((s) => s.showToast);
  const [report, setReport] = useState<string | null>(null);
  const [partial, setPartial] = useState(false);

  if (!open) return null;

  const onExportPng = async () => {
    if (!deck || exporting) return;
    setExporting(true);
    try {
      await exportDeckPngs(deck);
      setReport(`Downloaded ${deck.slides.length} PNG file(s) (canvas approximation).`);
      showToast("PNG slides downloaded", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(message, "error");
    } finally {
      setExporting(false);
    }
  };

  const onExportPdf = async () => {
    if (!deck || exporting) return;
    setExporting(true);
    try {
      await exportDeckPdf(deck);
      setReport("Opened print dialog for PDF — choose “Save as PDF”.");
      showToast("Print dialog opened for PDF", "info");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(message, "error");
    } finally {
      setExporting(false);
    }
  };

  const onExportPptx = async () => {
    if (!deck || exporting) return;
    setExporting(true);
    setReport(null);
    setPartial(false);
    try {
      const result = await exportDeckToPptx(deck, {
        output: "blob",
        filename: `${(deck.title || "deck").replace(/[^\w\- ]+/g, "").trim() || "deck"}.pptx`,
      });
      downloadBlob(result.data, result.filename, result.mimeType);
      const cov = result.report;
      const deg = cov.degradations ?? [];
      const failed = cov.elementCounts?.failed ?? 0;
      const isPartial = deg.length > 0 || failed > 0 || cov.fullyNative === false;
      setPartial(isPartial);
      const degLines = deg.slice(0, 12).map(
        (d) => `• [${d.kind}] ${d.elementType ?? "el"}: ${d.reason} → ${d.fallback}`,
      );
      const lines = [
        `File: ${result.filename}`,
        `Slides: ${deck.slides.length}`,
        `Native coverage: ${Math.round((cov.nativeCoverage ?? 0) * 100)}%`,
        `Degradations: ${deg.length}`,
        `Failed elements: ${failed}`,
        isPartial ? "Status: PARTIAL SUCCESS (content preserved with fallbacks)" : "Status: fully native export",
        ...(degLines.length ? ["", "Details:", ...degLines] : []),
      ];
      setReport(lines.join("\n"));
      if (isPartial) {
        showToast("PPTX downloaded · partial fidelity — see report", "info");
      } else {
        showToast("PowerPoint downloaded", "success");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setPartial(true);
      setReport(`Export failed: ${message}`);
      showToast(message, "error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        className="modal-panel modal-panel--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
      >
        <div className="modal-header">
          <h2 id="export-title">Export</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close export"
            onClick={() => setOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
            Download an editable deck. PPTX maps structured PPTD objects — not full-page images.
            Charts outside the v0.1 whitelist export as tables so data stays editable.
          </p>
          <div className="export-options">
            <button
              type="button"
              className="export-option"
              disabled={!deck || exporting}
              onClick={() => void onExportPptx()}
            >
              {exporting ? (
                <Loader2 size={22} className="spin" />
              ) : (
                <FileSpreadsheet size={22} />
              )}
              <span>
                <strong>PowerPoint (.pptx)</strong>
                <span>Native text, shapes, tables, charts</span>
              </span>
              <Download size={16} style={{ marginLeft: "auto" }} />
            </button>
            <button
              type="button"
              className="export-option"
              disabled={!deck || exporting}
              onClick={() => void onExportPng()}
            >
              <FileImage size={22} />
              <span>
                <strong>PNG images</strong>
                <span>One file per slide (preview-quality raster)</span>
              </span>
              <Download size={16} style={{ marginLeft: "auto" }} />
            </button>
            <button
              type="button"
              className="export-option"
              disabled={!deck || exporting}
              onClick={() => void onExportPdf()}
            >
              <FileText size={22} />
              <span>
                <strong>PDF (print)</strong>
                <span>Opens print dialog → Save as PDF</span>
              </span>
              <Download size={16} style={{ marginLeft: "auto" }} />
            </button>
          </div>
          {report ? (
            <pre
              className="export-report"
              data-partial={partial ? "true" : "false"}
              style={
                partial
                  ? { borderColor: "var(--selected)", background: "var(--selected-soft)" }
                  : undefined
              }
            >
              {report}
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}
