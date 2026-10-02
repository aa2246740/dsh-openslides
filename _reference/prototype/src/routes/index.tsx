import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  BarChart3,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  Download,
  FileImage,
  FileText,
  Folder,
  Grid2X2,
  Heart,
  Image,
  Layers3,
  LayoutPanelLeft,
  Link2,
  ListChecks,
  Maximize2,
  MessageCircle,
  MessageSquare,
  Minus,
  MoreHorizontal,
  MousePointer2,
  Paperclip,
  Play,
  Plus,
  Presentation,
  Redo2,
  RotateCcw,
  Share2,
  Sparkles,
  Table2,
  ThumbsDown,
  ThumbsUp,
  TerminalSquare,
  Type,
  Undo2,
  Upload,
  X,
} from "lucide-react";

export const Route = createFileRoute("/")({ component: KimiSlidesPrototype });

type Screen = "home" | "agent" | "workspace";
type DeckMode = "fusion" | "brand" | "rebuild";
type Modal = "none" | "attach" | "export" | "share" | "play";

const ASSET = "/assets/kimi";

const FUSION_PROMPT =
  'Create a McKinsey-style industry research presentation titled “Controlled Nuclear Fusion: From Scientific Experiment to Energy Industry.” Explain the industry\'s progression from scientific validation to commercialization, including its key opportunities and risks. Follow requirements.md and use the other attachments. Verify missing data through reliable public sources. All charts, timelines, matrices, process diagrams, and tables must be editable.';

const templates = [
  { title: "Freestyle", category: "All", image: "template-freestyle.jpg" },
  { title: "Color Bars Documentary", category: "Consulting", image: "template-color-bars.jpg" },
  { title: "Moss Green Transformation", category: "Consulting", image: "template-moss.jpg" },
  { title: "Pine Green Strategy", category: "Consulting", image: "template-pine.jpg" },
  { title: "Fresh Brand", category: "Work Report", image: "template-fresh.jpg" },
  { title: "Indigo Due Diligence", category: "Consulting", image: "template-indigo.jpg" },
  { title: "Orange Tech", category: "Finance", image: "template-orange-tech.jpg" },
  { title: "Lead Grey Quarterly", category: "Finance", image: "template-lead-grey.jpg" },
  { title: "Lake Blue Memo", category: "Finance", image: "template-meridian.jpg" },
];

const fusionSlides = [
  { title: "Controlled Nuclear Fusion", src: "slide-fusion-title.jpg" },
  { title: "Why now", src: "slide-fusion-data.jpg" },
  { title: "Pre-industrial bottlenecks", src: "slide-polished-charts.jpg" },
  { title: "Commercialization timeline", src: "slide-timeline.jpg" },
  { title: "Technology landscape", src: "slide-smartart.jpg" },
];

const agentSteps: Record<DeckMode, Array<{ icon: "read" | "think" | "todo" | "terminal" | "edit"; title: string; detail?: string }>> = {
  fusion: [
    { icon: "think", title: "Think" },
    { icon: "read", title: "Read", detail: "requirements.md" },
    { icon: "read", title: "Read", detail: "SKILL.md" },
    { icon: "todo", title: "Write Todo" },
    { icon: "read", title: "Read", detail: "pptd.md" },
    { icon: "terminal", title: "Execute Terminal", detail: "Build research deck and render 16 slides" },
    { icon: "edit", title: "Edit slide", detail: "Add editable charts, timeline and SmartArt" },
    { icon: "terminal", title: "Execute Terminal", detail: "Validate and screenshot final deck" },
  ],
  brand: [
    { icon: "read", title: "Read", detail: "KIMI Design.pptx" },
    { icon: "read", title: "Read", detail: "KIMI Brand Guidelines.pdf" },
    { icon: "think", title: "Think" },
    { icon: "todo", title: "Write Todo" },
    { icon: "edit", title: "Edit slide", detail: "Rebuild cover in the KIMI dot-matrix system" },
    { icon: "terminal", title: "Execute Terminal", detail: "Render, compare and validate brand consistency" },
  ],
  rebuild: [
    { icon: "think", title: "Create editable slide from image" },
    { icon: "read", title: "Read", detail: "SKILL.md" },
    { icon: "edit", title: "Generate Editable PPTD Slide", detail: "smart-connections.png" },
    { icon: "read", title: "Read", detail: "pptd.md" },
    { icon: "terminal", title: "Execute Terminal", detail: "Find flagged elements in converted page" },
    { icon: "edit", title: "Edit slide", detail: "page-1.page" },
    { icon: "terminal", title: "Execute Terminal", detail: "Revalidate and screenshot final converted slide" },
  ],
};

function KimiSlidesPrototype() {
  const [screen, setScreen] = useState<Screen>("home");
  const [deckMode, setDeckMode] = useState<DeckMode>("fusion");
  const [prompt, setPrompt] = useState(FUSION_PROMPT);
  const [category, setCategory] = useState("All");
  const [selectedTemplate, setSelectedTemplate] = useState("Freestyle");
  const [references, setReferences] = useState<string[]>([]);
  const [modal, setModal] = useState<Modal>("none");
  const [agentProgress, setAgentProgress] = useState(0);
  const [activeSlide, setActiveSlide] = useState(0);
  const [showThumbs, setShowThumbs] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [commentMode, setCommentMode] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentText, setCommentText] = useState("Remove cards, use thin separating lines instead");
  const [commentSent, setCommentSent] = useState(false);
  const [chartDataOpen, setChartDataOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [version, setVersion] = useState("V1");
  const [historical, setHistorical] = useState(false);
  const [brandRevamped, setBrandRevamped] = useState(false);
  const [chatText, setChatText] = useState("");
  const [chatRunning, setChatRunning] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (screen !== "agent") return;
    if (agentProgress >= agentSteps[deckMode].length) return;
    const timer = window.setTimeout(() => setAgentProgress((n) => n + 1), 620);
    return () => window.clearTimeout(timer);
  }, [screen, agentProgress, deckMode]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const begin = () => {
    const mode: DeckMode = references.some((r) => r.includes("SMART"))
      ? "rebuild"
      : references.length
        ? "brand"
        : "fusion";
    setDeckMode(mode);
    setAgentProgress(0);
    setScreen("agent");
  };

  const openWorkspace = () => {
    setScreen("workspace");
    setActiveSlide(0);
    setShowThumbs(deckMode === "fusion");
    setBrandRevamped(deckMode === "brand");
    setVersion(deckMode === "brand" ? "V3" : "V1");
  };

  const addReference = (kind: DeckMode) => {
    if (kind === "brand") {
      setReferences(["KIMI Design.pptx", "KIMI Brand Guidelines.pdf"]);
      setPrompt("Turn the uploaded file into slides");
    } else {
      setReferences(["SMART_CONNECTIONS.png"]);
      setPrompt("Recreate this image as a slide");
    }
    setModal("none");
  };

  const submitChat = () => {
    if (!chatText.trim()) return;
    setChatRunning(true);
    window.setTimeout(() => {
      setChatRunning(false);
      setBrandRevamped(true);
      setVersion("V3");
      setChatText("");
      setToast("Cover updated · version V3 saved");
    }, 1200);
  };

  const resetHome = () => {
    setScreen("home");
    setModal("none");
    setReferences([]);
    setPrompt(FUSION_PROMPT);
    setDeckMode("fusion");
    setVersion("V1");
    setHistorical(false);
  };

  return (
    <main className="kimi-app" data-testid="kimi-app">
      {screen === "home" && (
        <HomeScreen
          prompt={prompt}
          setPrompt={setPrompt}
          category={category}
          setCategory={setCategory}
          selectedTemplate={selectedTemplate}
          setSelectedTemplate={setSelectedTemplate}
          references={references}
          onAttach={() => setModal("attach")}
          onGenerate={begin}
        />
      )}

      {screen === "agent" && (
        <AgentScreen
          prompt={prompt}
          references={references}
          mode={deckMode}
          progress={agentProgress}
          onBack={() => setScreen("home")}
          onOpen={openWorkspace}
        />
      )}

      {screen === "workspace" && (
        <Workspace
          deckMode={deckMode}
          activeSlide={activeSlide}
          setActiveSlide={setActiveSlide}
          showThumbs={showThumbs}
          setShowThumbs={setShowThumbs}
          editMode={editMode}
          setEditMode={setEditMode}
          commentMode={commentMode}
          setCommentMode={setCommentMode}
          commentOpen={commentOpen}
          setCommentOpen={setCommentOpen}
          commentText={commentText}
          setCommentText={setCommentText}
          commentSent={commentSent}
          setCommentSent={setCommentSent}
          chartDataOpen={chartDataOpen}
          setChartDataOpen={setChartDataOpen}
          versionOpen={versionOpen}
          setVersionOpen={setVersionOpen}
          version={version}
          setVersion={setVersion}
          historical={historical}
          setHistorical={setHistorical}
          brandRevamped={brandRevamped}
          chatText={chatText}
          setChatText={setChatText}
          chatRunning={chatRunning}
          onSubmitChat={submitChat}
          onHome={resetHome}
          onModal={setModal}
          onToast={setToast}
        />
      )}

      {modal === "attach" && <AttachModal onClose={() => setModal("none")} onChoose={addReference} />}
      {modal === "export" && <ExportModal onClose={() => setModal("none")} onToast={setToast} />}
      {modal === "share" && <ShareModal onClose={() => setModal("none")} onToast={setToast} />}
      {modal === "play" && (
        <PlayModal
          mode={deckMode}
          active={activeSlide}
          onActive={setActiveSlide}
          revamped={brandRevamped}
          onClose={() => setModal("none")}
        />
      )}
      {toast && <div className="toast" role="status"><Check size={15} />{toast}</div>}
    </main>
  );
}

function HomeScreen(props: {
  prompt: string;
  setPrompt: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  selectedTemplate: string;
  setSelectedTemplate: (v: string) => void;
  references: string[];
  onAttach: () => void;
  onGenerate: () => void;
}) {
  const categories = ["All", "Consulting", "Finance", "Work Report", "Promotion", "Academic"];
  const visible = props.category === "All" ? templates.slice(0, 6) : templates.filter((t) => t.category === props.category);
  return (
    <section className="home-screen view-enter" data-testid="home-screen">
      <button className="upgrade-link"><Sparkles size={13} /> Upgrade your plan</button>
      <img className="kimi-wordmark" src={`${ASSET}/kimi-wordmark.png`} alt="KIMI" />

      <div className="prompt-card" data-testid="prompt-card">
        {props.references.length > 0 && (
          <div className="reference-row">
            {props.references.map((ref, i) => (
              <div className="reference-chip chip-enter" style={{ animationDelay: `${i * 70}ms` }} key={ref}>
                {ref.endsWith(".png") ? <FileImage size={19} /> : ref.endsWith(".pdf") ? <FileText size={19} /> : <Presentation size={19} />}
                <span><b>{ref}</b><small>{ref.endsWith(".pdf") ? "PDF 53.69 MB" : ref.endsWith(".png") ? "PNG 2.8 MB" : "PPTX 16.29 MB"}</small></span>
              </div>
            ))}
          </div>
        )}
        <div className="prompt-main">
          <div className="freestyle-chip"><img src={`${ASSET}/template-freestyle.jpg`} alt="" /><span>Freestyle</span></div>
          <textarea aria-label="Presentation prompt" value={props.prompt} onChange={(e) => props.setPrompt(e.target.value)} placeholder="Turn your ideas into stunning slides in minutes" />
        </div>
        <div className="prompt-actions">
          <button aria-label="Attach reference" className="icon-btn" onClick={props.onAttach}><Plus size={20} /></button>
          <button className="mode-btn active"><Presentation size={15} /> Slides</button>
          <button className="mode-btn"><LayoutPanelLeft size={14} /> Adaptive <ChevronDown size={13} /></button>
          <span className="prompt-spacer" />
          <button className="model-btn">K3 High <ChevronDown size={13} /></button>
          <button aria-label="Generate slides" className="send-btn" onClick={props.onGenerate}><ArrowUp size={18} /></button>
        </div>
      </div>
      <button className="project-row"><Folder size={14} /> Select project <ChevronDown size={13} /></button>

      <div className="template-area">
        <div className="category-tabs" role="tablist">
          {categories.map((c) => <button role="tab" aria-selected={c === props.category} className={c === props.category ? "selected" : ""} key={c} onClick={() => props.setCategory(c)}>{c}</button>)}
        </div>
        <div className="template-grid" key={props.category}>
          {visible.map((t, i) => (
            <button className={`template-card ${props.selectedTemplate === t.title ? "is-selected" : ""}`} style={{ animationDelay: `${i * 55}ms` }} key={t.title} onClick={() => props.setSelectedTemplate(t.title)}>
              <span className="template-image"><img src={`${ASSET}/${t.image}`} alt="" />{props.selectedTemplate === t.title && <span className="selected-badge"><Check size={13} /> Selected</span>}</span>
              <span>{t.title}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function AttachModal({ onClose, onChoose }: { onClose: () => void; onChoose: (mode: DeckMode) => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Attach a reference">
      <div className="attach-modal modal-enter">
        <button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <div className="drop-illustration"><FileText size={48} strokeWidth={1.4} /><Plus size={22} /></div>
        <h2>Drop files here to upload</h2>
        <p>Supported: PDF, Word, Excel, PPT/PPTX, images, CSV, and plain text.</p>
        <div className="demo-files">
          <button onClick={() => onChoose("brand")}><Presentation size={22} /><span><b>KIMI brand kit</b><small>PPTX + brand guidelines · exact video flow</small></span><ChevronRight size={17} /></button>
          <button onClick={() => onChoose("rebuild")}><FileImage size={22} /><span><b>SMART CONNECTIONS</b><small>Image → fully editable slide</small></span><ChevronRight size={17} /></button>
        </div>
      </div>
    </div>
  );
}

function AgentScreen(props: { prompt: string; references: string[]; mode: DeckMode; progress: number; onBack: () => void; onOpen: () => void }) {
  const steps = agentSteps[props.mode];
  const complete = props.progress >= steps.length;
  return (
    <section className="agent-screen view-enter" data-testid="agent-screen">
      <header className="agent-header"><button onClick={props.onBack}><ArrowLeft size={17} /></button><span>{props.mode === "fusion" ? "Fusion Industry Research" : props.mode === "brand" ? "Kimi K3 8-Slide Deck" : "Smart Connections Rebuild"}</span><MoreHorizontal size={17} /></header>
      <div className="agent-thread">
        {props.references.length > 0 && <div className="agent-attachments">{props.references.map((r) => <span key={r}><Paperclip size={13} />{r}</span>)}</div>}
        <div className="user-message">{props.prompt}</div>
        <div className="agent-turn">
          <div className="kimi-avatar"><i /><i /></div>
          <div className="tool-card">
            {steps.slice(0, Math.max(props.progress, 1)).map((step, i) => <ToolRow key={`${step.title}-${i}`} step={step} pending={i === props.progress - 1 && !complete} delay={i * 30} />)}
          </div>
        </div>
        {complete && (
          <div className="agent-complete completion-enter">
            <p>{props.mode === "fusion" ? "Done — I researched the industry, built a focused 16-slide narrative, and validated every chart, timeline, matrix and table as editable objects." : props.mode === "brand" ? "Done — I used the uploaded colors, typography and layout system to rebuild the deck consistently with the KIMI brand." : "Done — I recognized the text, shapes, connectors and formulas, converted them into editable elements, and validated the final slide."}</p>
            <button className="result-card" onClick={props.onOpen}>
              <img src={`${ASSET}/${props.mode === "fusion" ? "slide-fusion-title.jpg" : props.mode === "brand" ? "slide-k3-revamp.jpg" : "smart-reference.jpg"}`} alt="" />
              <span><b>{props.mode === "fusion" ? "Controlled Nuclear Fusion" : props.mode === "brand" ? "KIMI K3 — Open Frontier Intelligence" : "SMART CONNECTIONS"}</b><small>Edit and download</small></span>
              <strong>Edit</strong>
            </button>
            <div className="reaction-row"><Copy size={14} /><Heart size={14} /><ThumbsUp size={14} /><ThumbsDown size={14} /></div>
          </div>
        )}
      </div>
    </section>
  );
}

function ToolRow({ step, pending, delay }: { step: { icon: "read" | "think" | "todo" | "terminal" | "edit"; title: string; detail?: string }; pending: boolean; delay: number }) {
  const Icon = step.icon === "read" ? FileText : step.icon === "todo" ? ListChecks : step.icon === "terminal" ? TerminalSquare : step.icon === "edit" ? Presentation : Circle;
  return <div className="tool-row tool-enter" style={{ animationDelay: `${delay}ms` }}><Icon size={17} fill={step.icon === "think" ? "currentColor" : "none"} /><span>{step.title}</span>{step.detail && <small>{step.detail}</small>}<ChevronRight size={16} />{pending && <i className="running-dot" />}</div>;
}

function Workspace(props: {
  deckMode: DeckMode; activeSlide: number; setActiveSlide: (n: number) => void;
  showThumbs: boolean; setShowThumbs: (v: boolean) => void; editMode: boolean; setEditMode: (v: boolean) => void;
  commentMode: boolean; setCommentMode: (v: boolean) => void; commentOpen: boolean; setCommentOpen: (v: boolean) => void;
  commentText: string; setCommentText: (v: string) => void; commentSent: boolean; setCommentSent: (v: boolean) => void;
  chartDataOpen: boolean; setChartDataOpen: (v: boolean) => void; versionOpen: boolean; setVersionOpen: (v: boolean) => void;
  version: string; setVersion: (v: string) => void; historical: boolean; setHistorical: (v: boolean) => void;
  brandRevamped: boolean; chatText: string; setChatText: (v: string) => void; chatRunning: boolean; onSubmitChat: () => void;
  onHome: () => void; onModal: (v: Modal) => void; onToast: (v: string) => void;
}) {
  const deckTitle = props.deckMode === "fusion" ? "Controlled Nuclear Fusion" : props.deckMode === "brand" ? "KIMI K3 — Open Frontier Intelligence" : "SMART CONNECTIONS";
  return (
    <section className="workspace-shell view-enter" data-testid="workspace-screen">
      <WindowChrome title={props.deckMode === "brand" ? "Kimi K3 Cover Revamp" : props.deckMode === "rebuild" ? "Smart Connections Rebuild" : "Fusion Industry Research"} onHome={props.onHome} />
      <div className="workspace-grid">
        <aside className="chat-pane">
          <div className="chat-scroll">
            <div className="compact-tools"><Circle size={8} fill="currentColor" /> Think <ChevronRight size={14} /></div>
            <p className="agent-summary">{props.deckMode === "fusion" ? "Done — I verified sources, shaped the storyline, and created 16 editable consulting-style slides. Charts, timelines and matrices remain native objects." : props.deckMode === "brand" ? "Done — the cover now features a complete letter K in the brand’s dot-matrix style. It uses deep navy #102E52 on the guideline’s light-blue #8ABFFA panel, with matching echo trails and clean validation." : "Done — I converted the uploaded image into editable slide elements and re-rendered it successfully. Text, charts, labels and connectors remain individually selectable."}</p>
            <button className="mini-result" onClick={() => props.onToast("Deck is already open in the editor")}><img src={`${ASSET}/${props.deckMode === "fusion" ? "slide-fusion-title.jpg" : props.deckMode === "brand" ? "slide-k3-revamp.jpg" : "smart-reference.jpg"}`} alt="" /><span><b>{deckTitle}</b><small>Edit and download</small></span><strong>Edit</strong></button>
            <div className="reaction-row"><Copy size={14} /><Heart size={14} /><ThumbsUp size={14} /><ThumbsDown size={14} /></div>
            {props.deckMode === "brand" && props.brandRevamped && <div className="chat-confirm completion-enter"><Check size={15} /> Cover rebuilt with a complete dot-matrix K. Version V3 saved.</div>}
            {props.commentSent && <div className="chat-confirm completion-enter"><Check size={15} /> Comment applied — cards removed and thin separators added.</div>}
          </div>
          <div className="chat-composer">
            <textarea value={props.chatText} onChange={(e) => props.setChatText(e.target.value)} placeholder="Turn your ideas into stunning slides in minutes" />
            <div><button><Plus size={17} /></button><span>K3 Max <ChevronDown size={12} /></span><button aria-label="Send change" className="composer-send" onClick={props.onSubmitChat}>{props.chatRunning ? <span className="spinner" /> : <ArrowUp size={16} />}</button></div>
          </div>
          <small className="ai-note">AI-generated, for reference only</small>
        </aside>

        <section className="editor-pane">
          <EditorHeader
            title={deckTitle}
            version={props.version}
            versionOpen={props.versionOpen}
            setVersionOpen={props.setVersionOpen}
            setVersion={props.setVersion}
            setHistorical={props.setHistorical}
            historical={props.historical}
            onModal={props.onModal}
            onToast={props.onToast}
          />
          <div className="editor-subbar"><button aria-label="Toggle slide thumbnails" onClick={() => props.setShowThumbs(!props.showThumbs)}><LayoutPanelLeft size={18} /></button><button><Undo2 size={18} /></button><button className="muted"><Redo2 size={18} /></button><span /><button><Minus size={16} /></button><b>{props.deckMode === "rebuild" ? "31%" : "69%"}</b><button><Plus size={16} /></button></div>
          <div className="editor-body">
            {props.showThumbs && <SlideRail mode={props.deckMode} active={props.activeSlide} setActive={props.setActiveSlide} revamped={props.brandRevamped} />}
            <div className="canvas-stage">
              <SlideCanvas
                mode={props.deckMode}
                active={props.activeSlide}
                revamped={props.brandRevamped}
                historical={props.historical}
                editMode={props.editMode}
                commentMode={props.commentMode}
                commentOpen={props.commentOpen}
                setCommentOpen={props.setCommentOpen}
                commentText={props.commentText}
                setCommentText={props.setCommentText}
                commentSent={props.commentSent}
                setCommentSent={props.setCommentSent}
                chartDataOpen={props.chartDataOpen}
                setChartDataOpen={props.setChartDataOpen}
                onToast={props.onToast}
              />
              <FloatingToolbar
                editMode={props.editMode}
                setEditMode={props.setEditMode}
                commentMode={props.commentMode}
                setCommentMode={props.setCommentMode}
                onToast={props.onToast}
              />
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

function WindowChrome({ title, onHome }: { title: string; onHome: () => void }) {
  return <header className="window-chrome"><div className="traffic-lights"><Circle size={11} fill="#ff5f57" color="#ff5f57" /><Circle size={11} fill="#febc2e" color="#febc2e" /><Circle size={11} fill="#28c840" color="#28c840" /></div><button aria-label="Go home" onClick={onHome}><Grid2X2 size={15} /></button><span>{title}</span><ChevronDown size={13} /><span className="chrome-spacer" /><Paperclip size={16} /><i className="notification-count">4</i></header>;
}

function EditorHeader(props: { title: string; version: string; versionOpen: boolean; setVersionOpen: (v: boolean) => void; setVersion: (v: string) => void; setHistorical: (v: boolean) => void; historical: boolean; onModal: (v: Modal) => void; onToast: (v: string) => void }) {
  return <header className="editor-header"><Maximize2 size={16} /><span className="doc-title">{props.title}</span>{props.historical ? <><button className="history-action" onClick={() => { props.setHistorical(false); props.setVersion("V2"); props.onToast("Version V2 restored as the latest draft"); }}><RotateCcw size={14} /> Restore</button><button className="back-latest" onClick={() => { props.setHistorical(false); props.setVersion("V3"); }}>Back to latest</button></> : <div className="version-wrap"><button className="version-button" aria-label="Version history" onClick={() => props.setVersionOpen(!props.versionOpen)}>{props.version}<ChevronDown size={13} /></button>{props.versionOpen && <div className="version-menu menu-enter">{[{v:"V3",m:"Latest",t:"Edited by Kimi at 2 min ago"},{v:"V2",m:"",t:"Edited by Kimi at 22 min ago"},{v:"V1",m:"",t:"Edited by Kimi at 30 min ago"}].map((item) => <button key={item.v} onClick={() => {props.setVersion(item.v);props.setVersionOpen(false);props.setHistorical(item.v !== "V3");}}><span><b>{item.v}</b>{item.m && <em>{item.m}</em>}<small>{item.t}</small></span>{props.version === item.v && <Check size={15} />}</button>)}</div>}</div>}<button onClick={() => props.onModal("play")}><Play size={16} /> Play</button><button onClick={() => props.onModal("share")}><Share2 size={16} /> Share</button><button onClick={() => props.onModal("export")}><Upload size={16} /> Export</button><button aria-label="Messages"><MessageSquare size={17} /></button><button aria-label="Close editor"><X size={18} /></button></header>;
}

function SlideRail({ mode, active, setActive, revamped }: { mode: DeckMode; active: number; setActive: (n: number) => void; revamped: boolean }) {
  const slides = mode === "fusion" ? fusionSlides : mode === "brand" ? [{title:"Original cover",src:"slide-k3-original.jpg"},{title:"Dot-matrix cover",src:revamped?"slide-k3-revamp.jpg":"slide-k3-original.jpg"},{title:"Agentic coding",src:"slide-agentic-coding.jpg"}] : [{title:"Smart Connections",src:"smart-rebuilt.jpg"}];
  return <aside className="slide-rail"><div className="rail-count">{active + 1} / {slides.length}</div>{slides.map((s, i) => <button className={i === active ? "active" : ""} key={`${s.title}-${i}`} onClick={() => setActive(i)}><b>{String(i + 1).padStart(2,"0")}</b><img src={`${ASSET}/${s.src}`} alt="" /></button>)}<button className="new-slide"><Plus size={15} /> New slide</button></aside>;
}

function SlideCanvas(props: { mode: DeckMode; active: number; revamped: boolean; historical: boolean; editMode: boolean; commentMode: boolean; commentOpen: boolean; setCommentOpen: (v: boolean) => void; commentText: string; setCommentText: (v: string) => void; commentSent: boolean; setCommentSent: (v: boolean) => void; chartDataOpen: boolean; setChartDataOpen: (v: boolean) => void; onToast: (v: string) => void }) {
  const source = useMemo(() => {
    if (props.mode === "fusion") return fusionSlides[props.active]?.src ?? fusionSlides[0].src;
    if (props.mode === "rebuild") return "smart-rebuilt.jpg";
    if (props.active === 2) return "slide-agentic-coding.jpg";
    return props.historical || !props.revamped ? "slide-k3-original.jpg" : "slide-k3-revamp.jpg";
  }, [props.mode, props.active, props.revamped, props.historical]);
  const portrait = props.mode === "rebuild";
  const canChartEdit = props.mode === "fusion" && [1,2,4].includes(props.active) || props.mode === "rebuild";
  return <div className={`slide-wrap ${portrait ? "portrait" : "landscape"}`} data-testid="slide-canvas">
    <img key={source} className="slide-image slide-crossfade" src={`${ASSET}/${source}`} alt="Current editable slide" />
    {props.editMode && <div className={`selection-box ${props.mode === "rebuild" ? "poster-selection" : props.active === 4 ? "smartart-selection" : "chart-selection"}`}><i /><i /><i /><i /><i /><i /><i /><i /></div>}
    {props.editMode && <div className="context-toolbar toolbar-pop"><button title="Ask Kimi"><MessageCircle size={17} /></button>{canChartEdit && <button title="Edit data" onClick={() => props.setChartDataOpen(!props.chartDataOpen)}><BarChart3 size={18} /></button>}<button><Type size={18} /></button><button><Table2 size={17} /></button><button><ListChecks size={17} /></button><button><Layers3 size={18} /><ChevronDown size={11} /></button></div>}
    {props.chartDataOpen && <ChartDataPopover mode={props.mode} onClose={() => props.setChartDataOpen(false)} onToast={props.onToast} />}
    {props.commentMode && !props.commentSent && <button className="comment-pin pin-pop" aria-label="Add comment here" onClick={() => props.setCommentOpen(true)}><MessageCircle size={17} /></button>}
    {props.commentOpen && !props.commentSent && <div className="comment-popover modal-enter"><div><span className="tiny-avatar">K</span><b>Comment on this slide</b><button onClick={() => props.setCommentOpen(false)}><X size={14} /></button></div><textarea value={props.commentText} onChange={(e) => props.setCommentText(e.target.value)} /><button onClick={() => {props.setCommentOpen(false);props.setCommentSent(true);props.onToast("Kimi is applying your comment");}}>Send <ArrowUp size={14} /></button></div>}
    {props.commentSent && props.active === 2 && <span className="resolved-pin"><Check size={13} /></span>}
  </div>;
}

function ChartDataPopover({ mode, onClose, onToast }: { mode: DeckMode; onClose: () => void; onToast: (v: string) => void }) {
  const [last, setLast] = useState(mode === "rebuild" ? "53.6" : "2.7");
  const rows = mode === "rebuild" ? [["2016","1"],["2019","6.6"],["2022","24.8"],["2025",last]] : [["2020","0.3"],["2021","2.8"],["2022","1.1"],["2023","0.9"],["2024","0.6"],["2025",last]];
  return <div className="data-popover menu-enter"><div><b>Edit data</b><button onClick={onClose}><X size={14} /></button></div><table><thead><tr><th>category</th><th>S1</th></tr></thead><tbody>{rows.map((r,i) => <tr key={r[0]}><td>{r[0]}</td><td>{i === rows.length - 1 ? <input value={last} onChange={(e) => setLast(e.target.value)} onBlur={() => onToast("Chart data updated")} /> : r[1]}</td></tr>)}</tbody></table></div>;
}

function FloatingToolbar(props: { editMode: boolean; setEditMode: (v: boolean) => void; commentMode: boolean; setCommentMode: (v: boolean) => void; onToast: (v: string) => void }) {
  return <div className="floating-toolbar"><button className={props.editMode ? "active" : ""} onClick={() => {props.setEditMode(!props.editMode);props.setCommentMode(false);}}><MousePointer2 size={15} /> Edit</button><button className={props.commentMode ? "active" : ""} onClick={() => {props.setCommentMode(!props.commentMode);props.setEditMode(false);}}><MessageCircle size={15} /> Comment</button><button onClick={() => props.onToast("Text box inserted — double click to edit")}><Type size={18} /></button><button onClick={() => props.onToast("Shape library opened")}><Link2 size={17} /></button><button onClick={() => props.onToast("Image picker opened")}><Image size={17} /></button><button onClick={() => props.onToast("Table inserted")}><Table2 size={17} /></button><button onClick={() => props.onToast("SmartArt library opened")}><Sparkles size={17} /></button><button><MoreHorizontal size={18} /></button></div>;
}

function ExportModal({ onClose, onToast }: { onClose: () => void; onToast: (v: string) => void }) {
  const [format, setFormat] = useState("PowerPoint (.pptx)");
  const [exporting, setExporting] = useState(false);
  const run = () => {setExporting(true);window.setTimeout(() => {setExporting(false);onClose();onToast(`${format} export ready · editable objects preserved`);},1200);};
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="export-modal modal-enter"><div className="modal-title"><span><Download size={19} /> Export</span><button onClick={onClose}><X size={18} /></button></div><p>Choose a format. PowerPoint keeps charts, text, shapes and SmartArt editable.</p>{["PowerPoint (.pptx)","PDF document","PNG images"].map((f) => <button className={`format-row ${format === f ? "selected" : ""}`} key={f} onClick={() => setFormat(f)}><span className="format-icon">{f.startsWith("Power") ? <Presentation size={19} /> : f.startsWith("PDF") ? <FileText size={19} /> : <FileImage size={19} />}</span><span><b>{f}</b><small>{f.startsWith("Power") ? "Native editable objects" : f.startsWith("PDF") ? "Fixed-layout handoff" : "One image per slide"}</small></span>{format === f && <Check size={16} />}</button>)}<button className="primary-action" onClick={run}>{exporting ? <><span className="spinner dark" /> Preparing…</> : <><Upload size={16} /> Export</>}</button></div></div>;
}

function ShareModal({ onClose, onToast }: { onClose: () => void; onToast: (v: string) => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="share-modal modal-enter"><div className="modal-title"><span><Share2 size={19} /> Share deck</span><button onClick={onClose}><X size={18} /></button></div><p>Anyone with the link can view and comment.</p><div className="share-link"><span>kimi.com/slides/open-frontier-k3</span><button onClick={() => {onClose();onToast("Share link copied");}}><Copy size={15} /> Copy</button></div><label><span>Access</span><button>Can comment <ChevronDown size={13} /></button></label></div></div>;
}

function PlayModal({ mode, active, onActive, revamped, onClose }: { mode: DeckMode; active: number; onActive: (n: number) => void; revamped: boolean; onClose: () => void }) {
  const slides = mode === "fusion" ? fusionSlides.map((s) => s.src) : mode === "brand" ? ["slide-k3-original.jpg", revamped ? "slide-k3-revamp.jpg" : "slide-k3-original.jpg", "slide-agentic-coding.jpg"] : ["smart-rebuilt.jpg"];
  const current = Math.min(active, slides.length - 1);
  return <div className="play-overlay" role="dialog" aria-modal="true"><button className="play-close" onClick={onClose}><X size={22} /></button><img className={mode === "rebuild" ? "portrait" : ""} src={`${ASSET}/${slides[current]}`} alt="Slide presentation" /><button className="play-nav left" disabled={current === 0} onClick={() => onActive(current - 1)}><ChevronLeft size={28} /></button><button className="play-nav right" disabled={current === slides.length - 1} onClick={() => onActive(current + 1)}><ChevronRight size={28} /></button><span>{current + 1} / {slides.length}</span></div>;
}
