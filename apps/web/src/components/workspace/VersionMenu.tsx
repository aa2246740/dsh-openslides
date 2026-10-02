import { useEffect, useRef } from "react";
import { useAppStore } from "../../store/app-store";

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleString();
}

export function VersionMenu() {
  const open = useAppStore((s) => s.versionMenuOpen);
  const setOpen = useAppStore((s) => s.setVersionMenuOpen);
  const versions = useAppStore((s) => s.versions);
  const activeVersionId = useAppStore((s) => s.activeVersionId);
  const viewingVersionId = useAppStore((s) => s.viewingVersionId);
  const viewVersion = useAppStore((s) => s.viewVersion);
  const restoreVersion = useAppStore((s) => s.restoreVersion);
  const backToLatest = useAppStore((s) => s.backToLatestVersion);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  if (!open) return null;

  const sorted = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
  const latestId = versions[versions.length - 1]?.versionId;
  const isPreview = viewingVersionId != null && viewingVersionId !== latestId;

  return (
    <div className="version-menu" ref={rootRef} role="menu" aria-label="Version history">
      {sorted.map((v) => {
        const isLatest = v.versionId === latestId;
        const isCurrent =
          (viewingVersionId ?? activeVersionId) === v.versionId;
        return (
          <button
            key={v.versionId}
            type="button"
            role="menuitem"
            className="version-menu__item"
            aria-current={isCurrent ? "true" : undefined}
            onClick={() => {
              if (isLatest && !viewingVersionId) {
                setOpen(false);
                return;
              }
              viewVersion(v.versionId);
            }}
          >
            <span className="version-menu__label">
              {v.versionLabel}
              {isLatest ? " · Latest" : ""}
            </span>
            <span className="version-menu__meta">
              {v.actor === "agent" ? "Agent" : "You"} · {relativeTime(v.createdAt)}
              {v.summary ? ` · ${v.summary}` : ""}
            </span>
          </button>
        );
      })}
      {isPreview ? (
        <div style={{ display: "flex", gap: 6, padding: "8px 6px 4px" }}>
          <button
            type="button"
            className="btn-primary"
            style={{ flex: 1 }}
            onClick={() => restoreVersion(viewingVersionId!)}
          >
            Restore
          </button>
          <button
            type="button"
            className="btn-secondary"
            style={{ flex: 1 }}
            onClick={backToLatest}
          >
            Back to latest
          </button>
        </div>
      ) : null}
    </div>
  );
}
