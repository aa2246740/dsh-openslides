import { useCallback, useRef, useState } from "react";
import { FileText, Paperclip, Trash2, X } from "lucide-react";
import { useAppStore } from "../store/app-store";
import { formatBytes } from "../lib/download";

const DEMO_FILES = [
  {
    name: "Market_Brief.pdf",
    mimeType: "application/pdf",
    text: "EV market CAGR 18% through 2030; China, EU, US lead adoption. Battery cost curve continues downward.",
    sizeBytes: 240_000,
  },
  {
    name: "Brand_Guidelines.pdf",
    mimeType: "application/pdf",
    text: "Primary navy #0B1F33, accent blue #1F6FEB, Inter headings, generous margins, left accent bar on title slides.",
    sizeBytes: 180_000,
  },
  {
    name: "Financials_Q2.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    text: "Revenue by region: NA 42%, EU 31%, APAC 27%. Gross margin 38%.",
    sizeBytes: 64_000,
  },
  {
    name: "SMART_CONNECTIONS.png",
    mimeType: "image/png",
    kind: "image" as const,
    text: "SMART CONNECTIONS\nSense\nRoute\nDecide\nAct\nLearn\nVertical infographic — rebuild to editable stages",
    sizeBytes: 520_000,
  },
];

export function AttachModal() {
  const open = useAppStore((s) => s.attachModalOpen);
  const setOpen = useAppStore((s) => s.setAttachModalOpen);
  const references = useAppStore((s) => s.references);
  const addDemoReference = useAppStore((s) => s.addDemoReference);
  const removeReference = useAppStore((s) => s.removeReference);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onClose = useCallback(() => setOpen(false), [setOpen]);

  const addFileLike = useCallback(
    (file: File) => {
      const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(file.name);
      if (isImage) {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = typeof reader.result === "string" ? reader.result : undefined;
          addDemoReference({
            name: file.name,
            mimeType: file.type || "image/png",
            kind: "image",
            text: `Image upload: ${file.name}\n(Use prompt: Rebuild this image as editable slides)`,
            sizeBytes: file.size,
            dataUrl,
          });
        };
        reader.readAsDataURL(file);
        return;
      }
      void file.text().then(
        (text) => {
          addDemoReference({
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            text: text.slice(0, 4000),
            sizeBytes: file.size,
          });
        },
        () => {
          addDemoReference({
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            text: "(Binary file — mock parsed)",
            sizeBytes: file.size,
          });
        },
      );
    },
    [addDemoReference],
  );

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attach-title"
      >
        <div className="modal-header">
          <h2 id="attach-title">Attach references</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div
            className="dropzone"
            data-active={dragActive}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              const files = Array.from(e.dataTransfer.files);
              files.forEach(addFileLike);
            }}
          >
            <Paperclip size={28} strokeWidth={1.5} aria-hidden />
            <p className="dropzone__title">Drop files here or browse</p>
            <p className="dropzone__hint">
              PDF, DOC/DOCX, XLSX, PPT/PPTX, images, CSV, text
            </p>
            <div style={{ marginTop: 14, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => inputRef.current?.click()}
              >
                Browse files
              </button>
              {DEMO_FILES.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  className="btn-secondary"
                  onClick={() => addDemoReference(f)}
                >
                  Demo: {f.name.split(".")[0]}
                </button>
              ))}
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="sr-only"
              aria-label="File input"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                files.forEach(addFileLike);
                e.target.value = "";
              }}
            />
          </div>

          {references.length > 0 ? (
            <ul className="file-list" aria-label="Attached files">
              {references.map((r) => (
                <li key={r.id} className="file-row">
                  <FileText size={18} aria-hidden />
                  <div className="file-row__meta">
                    <div className="file-row__name">{r.name}</div>
                    <div className="file-row__sub">
                      {r.mimeType ?? "file"}
                      {r.sizeBytes != null ? ` · ${formatBytes(r.sizeBytes)}` : ""}
                    </div>
                    {(r.status === "uploading" || r.status === "parsing") &&
                    r.progress != null ? (
                      <div className="progress-bar" aria-hidden>
                        <span style={{ width: `${r.progress}%` }} />
                      </div>
                    ) : null}
                  </div>
                  <span
                    className={`file-row__status file-row__status--${r.status}`}
                  >
                    {r.status}
                  </span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove ${r.name}`}
                    onClick={() => removeReference(r.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" className="btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
