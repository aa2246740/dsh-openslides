import type { KeyboardEvent } from "react";
import { ArrowUp, Paperclip, SlidersHorizontal } from "lucide-react";
import { useAppStore, canGenerate } from "../store/app-store";
import {
  filterTemplates,
  getTemplate,
  TEMPLATE_CATEGORIES,
} from "../lib/templates";
import { ModelSelector } from "./ModelSelector";
import { AttachModal } from "./AttachModal";

export function CreateHub() {
  const prompt = useAppStore((s) => s.prompt);
  const setPrompt = useAppStore((s) => s.setPrompt);
  const templateId = useAppStore((s) => s.templateId);
  const setTemplateId = useAppStore((s) => s.setTemplateId);
  const category = useAppStore((s) => s.templateCategory);
  const setCategory = useAppStore((s) => s.setTemplateCategory);
  const modelId = useAppStore((s) => s.modelId);
  const setModelId = useAppStore((s) => s.setModelId);
  const references = useAppStore((s) => s.references);
  const setAttachOpen = useAppStore((s) => s.setAttachModalOpen);
  const removeReference = useAppStore((s) => s.removeReference);
  const startGenerate = useAppStore((s) => s.startGenerate);

  const templates = filterTemplates(category);
  const selected = getTemplate(templateId);
  const ready = canGenerate({ prompt, references });

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (ready) startGenerate();
    }
  };

  return (
    <div className="create-hub">
      <header className="create-hub__header">
        <div className="create-hub__wordmark">DSH SlideStudio</div>
        <span className="chip chip-muted">DSH SlideStudio · real PPTX</span>
      </header>

      <main className="create-hub__main">
        <div>
          <h1 className="create-hub__title">Create a deck</h1>
          <p className="create-hub__subtitle">
            Prompt, attach references, pick a template — get structured editable slides.
            Attach an image + ask to rebuild for portrait editable objects (SMART CONNECTIONS demo in Attach).
          </p>
        </div>

        <section className="prompt-card" aria-label="Prompt">
          <textarea
            className="prompt-card__textarea"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Turn your ideas into stunning slides in minutes"
            aria-label="Deck brief"
          />

          {references.length > 0 ? (
            <div className="prompt-card__refs" aria-label="References">
              {references.map((r) => (
                <span key={r.id} className="chip">
                  {r.name}
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 22, height: 22 }}
                    aria-label={`Remove ${r.name}`}
                    onClick={() => removeReference(r.id)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <div className="prompt-card__toolbar">
            <span className="style-pill" title="Selected template (auto default if you don't pick)">
              {selected ? (
                <img
                  className="style-pill__thumb"
                  src={selected.cover}
                  alt=""
                />
              ) : null}
              {selected?.name ?? "Freestyle"}
              {templateId === "freestyle" ? (
                <span className="chip chip-muted" style={{ marginLeft: 6, fontSize: 11 }}>
                  Auto
                </span>
              ) : null}
            </span>

            <button
              type="button"
              className="icon-btn"
              aria-label="Attach references"
              onClick={() => setAttachOpen(true)}
            >
              <Paperclip size={18} />
            </button>

            <span className="chip chip-muted" title="Output type">
              <SlidersHorizontal size={14} aria-hidden />
              Slides
            </span>

            <div className="prompt-card__toolbar-right">
              <ModelSelector value={modelId} onChange={setModelId} />
              <button
                type="button"
                className="submit-fab"
                aria-label="Generate deck"
                disabled={!ready}
                onClick={() => startGenerate()}
              >
                <ArrowUp size={18} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </section>

        <section aria-label="Templates">
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted)" }}>
            Template wall — <strong>Freestyle</strong> is selected by default (auto). Override any card.
          </p>
          <div className="template-section__tabs" role="tablist" aria-label="Template categories">
            {TEMPLATE_CATEGORIES.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                className="template-tab"
                aria-selected={category === tab.id}
                onClick={() => setCategory(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="template-grid">
            {templates.map((t) => {
              const pressed = templateId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  className="template-card"
                  aria-pressed={pressed}
                  aria-label={`${t.name} template`}
                  onClick={() => setTemplateId(t.id)}
                >
                  <div className="template-card__cover">
                    <img src={t.cover} alt="" />
                    {pressed ? (
                      <span className="template-card__badge">Selected</span>
                    ) : null}
                  </div>
                  <span className="template-card__name">{t.name}</span>
                  <span className="template-card__cat">
                    {t.category.replace("-", " ")}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </main>

      <AttachModal />
    </div>
  );
}
