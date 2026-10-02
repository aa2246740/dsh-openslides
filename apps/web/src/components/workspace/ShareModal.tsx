import { useMemo, useState } from "react";
import { Check, Copy, Link2, X } from "lucide-react";
import { useAppStore } from "../../store/app-store";

/**
 * Share entry (PRD §5.10). Real ACL not in scope (PRD marks as [I]);
 * provides link copy + access mode UI for product completeness.
 */
export function ShareModal() {
  const open = useAppStore((s) => s.shareModalOpen);
  const setOpen = useAppStore((s) => s.setShareModalOpen);
  const deck = useAppStore((s) => s.deck);
  const showToast = useAppStore((s) => s.showToast);
  const [copied, setCopied] = useState(false);

  const link = useMemo(() => {
    if (!deck) return "";
    const base =
      typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
    return `${base}#deck=${encodeURIComponent(deck.id)}&v=${encodeURIComponent(deck.versionId)}`;
  }, [deck]);

  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      showToast("Link copied (local session only)", "success");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      showToast("Could not copy — select the link manually", "error");
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
      <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div className="modal-header">
          <h2 id="share-title">Share</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close share"
            onClick={() => setOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
            Deck stays in <strong>this browser session only</strong>. There is no server-side ACL —
            the link is a bookmark to the deck id, not a shared live document.
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              padding: "8px 10px",
              border: "1px solid var(--hairline)",
              borderRadius: 8,
              background: "var(--surface, #fafafa)",
            }}
          >
            Access: <strong>Private — this device/session</strong>
          </p>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              border: "1px solid var(--hairline)",
              borderRadius: 10,
              padding: "8px 10px",
            }}
          >
            <Link2 size={16} style={{ flexShrink: 0, opacity: 0.6 }} />
            <input
              readOnly
              value={link}
              aria-label="Share link"
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 12,
              }}
            />
            <button type="button" className="btn-primary" onClick={() => void copy()}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
            {deck?.title || "Untitled"} · {deck?.slides.length ?? 0} slides · local only
          </p>
        </div>
      </div>
    </div>
  );
}
