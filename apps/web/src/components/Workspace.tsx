import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  Download,
  Image as ImageIcon,
  Link2,
  MessageSquare,
  Minus,
  MoreHorizontal,
  PanelLeft,
  Pencil,
  Play,
  Plus,
  Redo2,
  Share2,
  Sparkles,
  Table2,
  Type,
  Undo2,
  Workflow,
  X,
  Loader2,
} from "lucide-react";
import { sortSlidesByOrder, type ChartElement, type TextElement } from "@open-slidestudio/pptd";
import { useAppStore } from "../store/app-store";
import { ModelSelector } from "./ModelSelector";
import { ThumbnailStrip } from "./slide/ThumbnailStrip";
import { SlideCanvas } from "./slide/SlideCanvas";
import { ExportModal } from "./workspace/ExportModal";
import { VersionMenu } from "./workspace/VersionMenu";
import { CommentDraft } from "./workspace/CommentDraft";
import { ChartDataEditor } from "./workspace/ChartDataEditor";
import { SelectionToolbar } from "./workspace/SelectionToolbar";
import { ShareModal } from "./workspace/ShareModal";

function readonlyLikeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function Workspace() {
  const deck = useAppStore((s) => s.deck);
  const currentSlideId = useAppStore((s) => s.currentSlideId);
  const selectSlide = useAppStore((s) => s.selectSlide);
  const selectedElementId = useAppStore((s) => s.selectedElementId);
  const selectElement = useAppStore((s) => s.selectElement);
  const thumbsOpen = useAppStore((s) => s.thumbsOpen);
  const setThumbsOpen = useAppStore((s) => s.setThumbsOpen);
  const zoom = useAppStore((s) => s.zoom);
  const setZoom = useAppStore((s) => s.setZoom);
  const fitZoom = useAppStore((s) => s.fitZoom);
  const setFitZoom = useAppStore((s) => s.setFitZoom);
  const versions = useAppStore((s) => s.versions);
  const activeVersionId = useAppStore((s) => s.activeVersionId);
  const viewingVersionId = useAppStore((s) => s.viewingVersionId);
  const versionMenuOpen = useAppStore((s) => s.versionMenuOpen);
  const setVersionMenuOpen = useAppStore((s) => s.setVersionMenuOpen);
  const backToLatest = useAppStore((s) => s.backToLatestVersion);
  const restoreVersion = useAppStore((s) => s.restoreVersion);
  const comments = useAppStore((s) => s.comments);
  const commentMode = useAppStore((s) => s.commentMode);
  const processAllAnnotations = useAppStore((s) => s.processAllAnnotations);
  const processingPins = useAppStore((s) => s.processingPins);
  const openPinCount = comments.filter((c) => !c.resolved).length;
  const setCommentMode = useAppStore((s) => s.setCommentMode);
  const placeCommentDraft = useAppStore((s) => s.placeCommentDraft);
  const draftComment = useAppStore((s) => s.draftComment);
  const resolveComment = useAppStore((s) => s.resolveComment);
  const chatMessages = useAppStore((s) => s.chatMessages);
  const refineDraft = useAppStore((s) => s.refineDraft);
  const setRefineDraft = useAppStore((s) => s.setRefineDraft);
  const sendRefinement = useAppStore((s) => s.sendRefinement);
  const refining = useAppStore((s) => s.refining);
  const agentSteps = useAppStore((s) => s.agentSteps);
  const agentStatus = useAppStore((s) => s.agentStatus);
  const modelId = useAppStore((s) => s.modelId);
  const setModelId = useAppStore((s) => s.setModelId);
  const setExportModalOpen = useAppStore((s) => s.setExportModalOpen);
  const backToCreate = useAppStore((s) => s.backToCreate);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const undoStack = useAppStore((s) => s.undoStack);
  const redoStack = useAppStore((s) => s.redoStack);
  const workspacePane = useAppStore((s) => s.workspacePane);
  const setWorkspacePane = useAppStore((s) => s.setWorkspacePane);
  const playMode = useAppStore((s) => s.playMode);
  const setPlayMode = useAppStore((s) => s.setPlayMode);
  const updateSelectedText = useAppStore((s) => s.updateSelectedText);
  const nudgeSelected = useAppStore((s) => s.nudgeSelected);
  const addTextBox = useAppStore((s) => s.addTextBox);
  const addShape = useAppStore((s) => s.addShape);
  const addTable = useAppStore((s) => s.addTable);
  const addChart = useAppStore((s) => s.addChart);
  const addImage = useAppStore((s) => s.addImage);
  const addSmartArt = useAppStore((s) => s.addSmartArt);
  const setShareModalOpen = useAppStore((s) => s.setShareModalOpen);
  const setChartDataEditorOpen = useAppStore((s) => s.setChartDataEditorOpen);
  const showToast = useAppStore((s) => s.showToast);

  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 800, h: 500 });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) setStageSize({ w: cr.width, h: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const slides = useMemo(
    () => (deck ? sortSlidesByOrder(deck) : []),
    [deck],
  );
  const slide =
    slides.find((s) => s.id === currentSlideId) ?? slides[0] ?? null;

  const computedZoom = useMemo(() => {
    if (!slide) return zoom;
    if (!fitZoom) return zoom;
    const pad = 48;
    const zw = (stageSize.w - pad) / slide.size.width;
    const zh = (stageSize.h - pad) / slide.size.height;
    return Math.min(Math.max(Math.min(zw, zh), 0.2), 1.2);
  }, [fitZoom, zoom, slide, stageSize]);

  const activeVersion =
    versions.find((v) => v.versionId === (viewingVersionId ?? activeVersionId)) ??
    versions[versions.length - 1];

  const selectedEl =
    slide && selectedElementId
      ? slide.elements.find((e) => e.id === selectedElementId)
      : undefined;

  const selectedText =
    selectedEl?.kind === "text" ? (selectedEl as TextElement) : null;
  const selectedChart =
    selectedEl?.kind === "chart" ? (selectedEl as ChartElement) : null;

  const pickImage = () => {
    if (readonly) {
      showToast("Read-only history — return to latest to edit", "error");
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          addImage(reader.result, file.name);
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (playMode) {
        if (e.key === "Escape") {
          setPlayMode(false);
          return;
        }
        if (!deck) return;
        const list = sortSlidesByOrder(deck);
        const idx = list.findIndex((s) => s.id === currentSlideId);
        if (e.key === "ArrowRight" || e.key === " ") {
          e.preventDefault();
          const next = list[Math.min(list.length - 1, idx + 1)];
          if (next) selectSlide(next.id);
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          const prev = list[Math.max(0, idx - 1)];
          if (prev) selectSlide(prev.id);
        }
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (
        !mod &&
        (e.key === "ArrowUp" ||
          e.key === "ArrowDown" ||
          e.key === "ArrowLeft" ||
          e.key === "ArrowRight") &&
        selectedElementId &&
        !readonlyLikeTarget(e.target)
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx =
          e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy =
          e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        nudgeSelected(dx, dy);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    playMode,
    deck,
    currentSlideId,
    selectSlide,
    setPlayMode,
    undo,
    redo,
    selectedElementId,
    nudgeSelected,
  ]);

  if (!deck || !slide) {
    return (
      <div className="workspace">
        <div className="empty-state">No deck loaded.</div>
      </div>
    );
  }

  if (playMode) {
    return (
      <div
        className="workspace"
        style={{ background: "#111", justifyContent: "center" }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
          onClick={() => {
            const list = sortSlidesByOrder(deck);
            const idx = list.findIndex((s) => s.id === slide.id);
            const next = list[idx + 1];
            if (next) selectSlide(next.id);
            else setPlayMode(false);
          }}
        >
          <SlideCanvas
            slide={slide}
            scale={Math.min(
              (window.innerWidth - 48) / slide.size.width,
              (window.innerHeight - 48) / slide.size.height,
            )}
            selectedElementId={null}
            onSelectElement={() => undefined}
            interactive={false}
          />
        </div>
        <button
          type="button"
          className="btn-secondary"
          style={{ position: "fixed", top: 16, right: 16 }}
          onClick={() => setPlayMode(false)}
          aria-label="Exit play mode"
        >
          <X size={16} /> Exit
        </button>
      </div>
    );
  }

  const readonly = viewingVersionId != null;

  return (
    <div className="workspace">
      <header className="workspace__chrome">
        <div className="traffic-lights" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Back to create hub"
          onClick={backToCreate}
        >
          <ArrowLeft size={16} />
        </button>
        <div className="workspace__doc-title">{deck.title}</div>
        <div className="workspace__chrome-actions">
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="btn-secondary"
              aria-haspopup="menu"
              aria-expanded={versionMenuOpen}
              onClick={() => setVersionMenuOpen(!versionMenuOpen)}
            >
              {activeVersion?.versionLabel ?? "V1"}
              <ChevronDown size={14} aria-hidden />
            </button>
            <VersionMenu />
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Play"
            onClick={() => setPlayMode(true)}
          >
            <Play size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Share"
            onClick={() => setShareModalOpen(true)}
          >
            <Share2 size={16} />
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setExportModalOpen(true)}
          >
            <Download size={14} />
            Export
          </button>
        </div>
      </header>

      <div className="mobile-tabs" role="tablist" aria-label="Workspace panes">
        <button
          type="button"
          role="tab"
          aria-selected={workspacePane === "chat"}
          onClick={() => setWorkspacePane("chat")}
        >
          Chat
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={workspacePane === "editor"}
          onClick={() => setWorkspacePane("editor")}
        >
          Editor
        </button>
      </div>

      <div className="workspace__body" data-pane={workspacePane}>
        {/* Left chat */}
        <aside className="chat-panel" aria-label="Agent chat">
          <div className="chat-panel__scroll">
            {chatMessages.map((m) => (
              <div key={m.id} className={`chat-msg chat-msg--${m.role}`}>
                {m.content}
              </div>
            ))}

            {(refining ||
              (agentStatus !== "ready" &&
                agentStatus !== "idle" &&
                agentStatus !== "failed" &&
                agentSteps.length > 0)) && (
              <div className="chat-msg chat-msg--assistant">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Loader2 size={14} className="spin" />
                  <strong style={{ fontSize: 12 }}>Agent working…</strong>
                </div>
                {agentSteps.slice(-4).map((st) => (
                  <div
                    key={st.id}
                    style={{
                      fontSize: 12,
                      color: "var(--muted)",
                      marginBottom: 4,
                    }}
                  >
                    {st.status === "completed" ? "✓" : "·"} {st.label}
                    {st.target ? ` · ${st.target}` : ""}
                    {st.summary ? ` — ${st.summary}` : ""}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="chat-panel__composer">
            <textarea
              className="chat-panel__input"
              value={refineDraft}
              onChange={(e) => setRefineDraft(e.target.value)}
              placeholder="Ask for refinements… (e.g. strengthen the title slide)"
              aria-label="Refinement prompt"
              disabled={readonly || refining}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  sendRefinement();
                }
              }}
            />
            <div className="chat-panel__composer-bar">
              <ModelSelector value={modelId} onChange={setModelId} align="left" />
              <button
                type="button"
                className="btn-primary"
                style={{ marginLeft: "auto" }}
                disabled={readonly || refining || !refineDraft.trim()}
                onClick={sendRefinement}
              >
                {refining ? <Loader2 size={14} className="spin" /> : null}
                Send
              </button>
            </div>
          </div>
        </aside>

        {/* Right editor */}
        <section className="editor-panel" aria-label="Slide editor">
          <div className="editor-toolbar">
            <button
              type="button"
              className="icon-btn"
              aria-label="Toggle thumbnails"
              aria-pressed={thumbsOpen}
              onClick={() => setThumbsOpen(!thumbsOpen)}
            >
              <PanelLeft size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Undo"
              disabled={!undoStack.length || readonly}
              onClick={undo}
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Redo"
              disabled={!redoStack.length || readonly}
              onClick={redo}
            >
              <Redo2 size={16} />
            </button>
            <div className="editor-toolbar__spacer" />
            <div className="editor-toolbar__zoom">
              <button
                type="button"
                className="icon-btn"
                aria-label="Zoom out"
                onClick={() => setZoom(computedZoom - 0.1)}
              >
                <Minus size={14} />
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ minHeight: 28, padding: "0 8px" }}
                onClick={() => setFitZoom(true)}
                aria-label="Fit to viewport"
              >
                {Math.round(computedZoom * 100)}%
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label="Zoom in"
                onClick={() => setZoom(computedZoom + 0.1)}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {readonly ? (
            <div className="version-banner" role="status">
              Viewing {activeVersion?.versionLabel} (read-only)
              <button type="button" className="btn-secondary" onClick={backToLatest}>
                Back to latest
              </button>
              {viewingVersionId ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => restoreVersion(viewingVersionId)}
                >
                  Restore
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="editor-main">
            {thumbsOpen ? (
              <ThumbnailStrip
                deck={deck}
                currentSlideId={slide.id}
                onSelect={selectSlide}
              />
            ) : null}
            <div className="canvas-stage" ref={stageRef}>
              <div style={{ position: "relative" }}>
                <SlideCanvas
                  slide={slide}
                  scale={computedZoom}
                  selectedElementId={selectedElementId}
                  onSelectElement={selectElement}
                  interactive={!readonly}
                  comments={comments}
                  commentMode={commentMode && !readonly}
                  draftComment={draftComment}
                  onPlaceComment={(x, y) => placeCommentDraft(slide.id, x, y)}
                  onCommentClick={(id) => {
                    const c = comments.find((x) => x.id === id);
                    if (c && !c.resolved) resolveComment(id);
                    else showToast(c?.text ?? "Comment", "info");
                  }}
                />
                {draftComment ? (
                  <CommentDraft scale={computedZoom} slideWidth={slide.size.width} />
                ) : null}
              </div>

              {selectedEl && !readonly ? (
                <div style={{ position: "absolute", left: "50%", bottom: 72, transform: "translateX(-50%)", zIndex: 50001 }}>
                  <SelectionToolbar element={selectedEl} disabled={readonly} />
                </div>
              ) : null}

              {selectedText && !readonly ? (
                <div
                  className="bottom-toolbar"
                  style={{ bottom: 120, maxWidth: 420, borderRadius: 12, padding: 8 }}
                >
                  <label className="sr-only" htmlFor="inline-text-edit">
                    Edit text
                  </label>
                  <input
                    id="inline-text-edit"
                    style={{
                      flex: 1,
                      border: "1px solid var(--hairline)",
                      borderRadius: 8,
                      padding: "6px 10px",
                      minWidth: 200,
                    }}
                    value={selectedText.paragraphs[0]?.runs.map((r) => r.text).join("") ?? ""}
                    onChange={(e) => updateSelectedText(e.target.value)}
                  />
                </div>
              ) : null}

              {selectedChart && !readonly ? (
                <div style={{ position: "absolute", right: 16, bottom: 72, zIndex: 50002, maxWidth: 420 }}>
                  <ChartDataEditor chart={selectedChart} />
                </div>
              ) : null}

              {!playMode ? (
                <div className="bottom-toolbar" role="toolbar" aria-label="Slide tools">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Edit"
                    aria-pressed={!commentMode}
                    onClick={() => {
                      setCommentMode(false);
                      setChartDataEditorOpen(false);
                    }}
                    title="Edit"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Agent annotate"
                    aria-pressed={commentMode}
                    onClick={() => setCommentMode(!commentMode)}
                    title="Agent annotate (pin work orders)"
                  >
                    <MessageSquare size={16} />
                  </button>
                  {openPinCount > 0 ? (
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ minHeight: 32, padding: "0 10px", fontSize: 12 }}
                      aria-label={`Process ${openPinCount} annotations`}
                      disabled={readonly || processingPins || refining}
                      onClick={() => processAllAnnotations()}
                      title="Process all agent annotations"
                    >
                      {processingPins ? (
                        <Loader2 size={14} className="spin" />
                      ) : null}
                      Process {openPinCount} pin{openPinCount === 1 ? "" : "s"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Add text"
                    title="Text"
                    disabled={readonly}
                    onClick={addTextBox}
                  >
                    <Type size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Add shape"
                    title="Shape"
                    disabled={readonly}
                    onClick={addShape}
                  >
                    <Link2 size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Add image"
                    title="Image"
                    disabled={readonly}
                    onClick={pickImage}
                  >
                    <ImageIcon size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Add chart"
                    title="Chart"
                    disabled={readonly}
                    onClick={() => {
                      addChart();
                      setChartDataEditorOpen(true);
                    }}
                  >
                    <Sparkles size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Add table"
                    title="Table"
                    disabled={readonly}
                    onClick={addTable}
                  >
                    <Table2 size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Add SmartArt"
                    title="SmartArt"
                    disabled={readonly}
                    onClick={addSmartArt}
                  >
                    <Workflow size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="AI refine"
                    title="AI"
                    onClick={() => setWorkspacePane("chat")}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      <ExportModal />
      <ShareModal />
    </div>
  );
}
