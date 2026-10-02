import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { getModelLabel, MODEL_OPTIONS } from "../lib/models";

type Props = {
  value: string;
  onChange: (id: string) => void;
  align?: "left" | "right";
};

export function ModelSelector({ value, onChange, align = "right" }: Props) {
  const [open, setOpen] = useState(false);
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
  }, [open]);

  return (
    <div className="model-select" ref={rootRef}>
      <button
        type="button"
        className="model-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Model selector"
        onClick={() => setOpen((v) => !v)}
      >
        {getModelLabel(value)}
        <ChevronDown size={14} aria-hidden />
      </button>
      {open ? (
        <div
          className="model-select__menu"
          role="listbox"
          aria-label="Models"
          style={align === "left" ? { left: 0, right: "auto" } : undefined}
        >
          {MODEL_OPTIONS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="option"
              className="model-select__item"
              aria-selected={m.id === value}
              onClick={() => {
                onChange(m.id);
                setOpen(false);
              }}
            >
              <strong>
                {m.label}
                {m.offline ? " · offline" : ""}
              </strong>
              <span>{m.description}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
