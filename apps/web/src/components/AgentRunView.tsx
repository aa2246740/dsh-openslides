import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Square,
} from "lucide-react";
import { sortSlidesByOrder } from "@open-slidestudio/pptd";
import { useAppStore } from "../store/app-store";
import { SlideCanvas } from "./slide/SlideCanvas";

export function AgentRunView() {
  const prompt = useAppStore((s) => s.prompt);
  const references = useAppStore((s) => s.references);
  const agentStatus = useAppStore((s) => s.agentStatus);
  const agentSteps = useAppStore((s) => s.agentSteps);
  const agentSummary = useAppStore((s) => s.agentSummary);
  const agentError = useAppStore((s) => s.agentError);
  const deck = useAppStore((s) => s.deck);
  const expandedStepIds = useAppStore((s) => s.expandedStepIds);
  const toggleStepExpanded = useAppStore((s) => s.toggleStepExpanded);
  const cancelRun = useAppStore((s) => s.cancelRun);
  const openWorkspace = useAppStore((s) => s.openWorkspace);
  const backToCreate = useAppStore((s) => s.backToCreate);
  const startGenerate = useAppStore((s) => s.startGenerate);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [agentSteps, agentStatus, deck, autoScroll]);

  const running =
    agentStatus !== "ready" &&
    agentStatus !== "failed" &&
    agentStatus !== "cancelled" &&
    agentStatus !== "idle";

  const title =
    prompt.trim().slice(0, 48) ||
    references[0]?.name ||
    "New deck";

  return (
    <div className="agent-run">
      <header className="agent-run__top">
        <button
          type="button"
          className="icon-btn"
          aria-label="Back to create"
          onClick={backToCreate}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="agent-run__title">{title}</div>
        {running ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={cancelRun}
            aria-label="Cancel generation"
          >
            <Square size={12} fill="currentColor" />
            Cancel
          </button>
        ) : null}
      </header>

      <div
        className="agent-run__body"
        ref={scrollRef}
        onScroll={(e) => {
          const t = e.currentTarget;
          const nearBottom =
            t.scrollHeight - t.scrollTop - t.clientHeight < 80;
          setAutoScroll(nearBottom);
        }}
      >
        <div className="user-bubble">
          {prompt.trim() || "(References only)"}
          {references.length > 0 ? (
            <div className="user-bubble__refs">
              {references.map((r) => (
                <span key={r.id} className="chip chip-muted">
                  {r.name}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="agent-block">
          <div className="agent-avatar" aria-hidden>
            OS
          </div>
          <div className="agent-tools">
            {agentSteps.length === 0 && running ? (
              <p className="agent-status-line" style={{ paddingLeft: 0 }}>
                <Loader2 size={14} className="spin" aria-hidden /> Starting…
              </p>
            ) : null}

            {agentSteps.map((step) => {
              const open = expandedStepIds[step.id];
              return (
                <div
                  key={step.id}
                  className="tool-row"
                  data-open={open ? "true" : "false"}
                >
                  <button
                    type="button"
                    className="tool-row__head"
                    onClick={() => toggleStepExpanded(step.id)}
                    aria-expanded={!!open}
                  >
                    <span
                      className={`tool-row__status tool-row__status--${step.status}`}
                      aria-hidden
                    />
                    <span className="tool-row__label">{step.label}</span>
                    {step.target ? (
                      <span className="tool-row__target">{step.target}</span>
                    ) : (
                      <span className="tool-row__target" />
                    )}
                    {step.status === "running" ? (
                      <Loader2 size={14} className="spin" aria-label="Running" />
                    ) : step.status === "completed" ? (
                      <Check size={14} aria-label="Completed" />
                    ) : open ? (
                      <ChevronDown size={14} aria-hidden />
                    ) : (
                      <ChevronRight size={14} aria-hidden />
                    )}
                  </button>
                  {open || step.status === "running" ? (
                    <div className="tool-row__body">
                      {step.detail || step.summary || step.error || "…"}
                      {step.durationMs != null && step.status === "completed" ? (
                        <div style={{ marginTop: 4 }}>
                          {Math.round(step.durationMs)} ms
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {running ? (
              <p className="agent-status-line" style={{ paddingLeft: 0 }}>
                Status: {agentStatus}
              </p>
            ) : null}

            {agentError ? (
              <div
                className="result-card"
                style={{ marginLeft: 0, borderColor: "var(--danger)" }}
              >
                <div className="result-card__meta">
                  <p className="result-card__title">Generation failed</p>
                  <p className="result-card__summary">{agentError}</p>
                  <div className="result-card__actions">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => startGenerate()}
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={backToCreate}
                    >
                      Edit request
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {agentStatus === "ready" && deck ? (
              <div className="result-card">
                <div className="result-card__preview">
                  {sortSlidesByOrder(deck)
                    .slice(0, 3)
                    .map((slide) => (
                      <div key={slide.id} className="result-card__thumb">
                        <SlideCanvas
                          slide={slide}
                          scale={200 / slide.size.width}
                          selectedElementId={null}
                          onSelectElement={() => undefined}
                          interactive={false}
                          thumbnail
                        />
                      </div>
                    ))}
                </div>
                <div className="result-card__meta">
                  <h3 className="result-card__title">{deck.title}</h3>
                  <p className="result-card__summary">
                    {agentSummary ||
                      `${deck.slides.length} structured slides ready`}
                  </p>
                  <div className="result-card__actions">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={openWorkspace}
                    >
                      Open editor
                    </button>
                    <span className="chip chip-muted">
                      {deck.slides.length} slides · structured IR
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            {agentStatus === "cancelled" ? (
              <p className="agent-status-line" style={{ paddingLeft: 0 }}>
                Cancelled.{" "}
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={backToCreate}
                >
                  Back
                </button>
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
