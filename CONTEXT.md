# Open SlideStudio

Open SlideStudio is an independent, local-first AI presentation product. It exists to reproduce Kimi Slides' complete visual and interaction experience while owning its agent runtime, document model, editor, and export path.

## Product and acceptance

**Open SlideStudio**:
The independent product being shipped: a single-user, self-hosted AI presentation workspace with its own agent, editor, persistence, and export path.
_Avoid_: OpenKimi wrapper, Kimi shell, slide demo

**Local-first product**:
The first shippable product runs for one user with project data persisted locally; multi-user accounts and tenancy are not prerequisites for completion.
_Avoid_: prototype, multi-tenant service

**Local Web Product**:
The first product carrier: a locally started web application used in the browser, with local persistence and product-owned backend services. A native desktop wrapper is not required for the first complete release.
_Avoid_: web demo, hosted SaaS, desktop prerequisite

**Kimi-aligned 1:1**:
The completion gate: the full in-scope Parity Baseline is reproduced in visual treatment and behavior, including tooltips, micro-buttons, hover, focus, selected, disabled, loading, and error states. Open SlideStudio branding replaces Kimi trademarks.
_Avoid_: core-flow parity, capability-only parity, approximate shell

**Parity Baseline**:
A frozen, versioned capture of the official Kimi Slides surface against which one Open SlideStudio parity release is verified. Later Kimi changes create a new baseline rather than moving the existing completion gate.
_Avoid_: current Kimi, latest UI, rolling target

**Parity Exclusion**:
A named official-service capability outside the independent product boundary, limited to Kimi account, payment, and official cloud integrations or an explicitly approved equivalent. It cannot be used to omit presentation generation, editing, tooltips, micro-interactions, or state behavior.
_Avoid_: wont-port shortcut, backlog item

**Production independence**:
The shipped product can generate, render, edit, review, persist, and export without a Kimi or Moonshot iframe, host, CDN, or official export script.
_Avoid_: iframe-backed product, official-shell fallback

**Development oracle**:
The official Kimi surface may be used only during development to capture behavior, screenshots, and golden evidence; it is not packaged into or contacted by the production runtime.
_Avoid_: production dependency, live CI dependency

**Provider Connection**:
The local user's direct authorization of an LLM supplier through an API key or a supplier-supported OAuth flow. Open SlideStudio does not require its own user account for the local-first product.
_Avoid_: product login, Open SlideStudio account, tenant identity

**Normal Creation Path**:
The user-facing route from the Create Hub through a Provider Connection and a real DSH Agent Run into a newly created PPTD Project opened in the Self Canvas. A CLI-only run does not satisfy this path.
_Avoid_: harness proof, fixture launch, terminal workflow

## Agent generation

**Agent Kernel**:
The single version-pinned DeepSeek Harness (`dsh-v0.1.5-rc.2`) runtime that manages model sessions, context, tools, provider credentials, retries, and resume behavior for every production Agent Run. Pi is not the product kernel.
_Avoid_: custom agent loop, dual runtime

**Agent Director**:
The provider-backed agent running inside the Agent Kernel that owns research, narrative planning, page planning, visual composition, page writing, review, and revision.
_Avoid_: Host Brain, host painter, scripted finisher

**Tool Host**:
The deterministic product runtime that supplies authentication, tools, project storage, rendering, validation, and export without making presentation content or design decisions.
_Avoid_: director, designer, salvage composer

**Agent Run**:
A traceable attempt by an Agent Director to turn a brief and its materials into a reviewed PPTD Project through product tools.
_Avoid_: generate request, host-produced deck

**Authentic Generation**:
An Agent Run in which the selected provider actually executes through DSH and the Agent Director makes task-specific narrative, page-plan, composition, writing, review, and revision decisions that produce the PPTD Project. The run carries enough provenance to distinguish those decisions from fixture playback or text replacement.
_Avoid_: fake generation, template substitution, simulated agent

**Generation Provenance**:
The model and provider identity, DSH session, ordered tool events, created or changed PPTD artifacts, validation results, and completion decision retained for an Agent Run.
_Avoid_: loading animation, success toast, host-only log

**Agent Timeline**:
The user-readable Kimi-aligned view of an Agent Run's plan, active work, tool use, page progress, review, pause, failure, and completion. It is backed by Generation Provenance rather than simulated timers.
_Avoid_: fake progress, debug console, spinner-only state

**Failed Generation**:
An Agent Run that pauses or ends without satisfying its completion gates; it retains recoverable state but never reports a ready deck.
_Avoid_: partial success, salvaged success

**Template Mode**:
An explicitly selected non-agent demonstration or fixture workflow available only to development and test entry points, not the normal creation experience. It must never be presented as a successful Agent Run.
_Avoid_: offline AI, agent fallback

**Template Substitution**:
A forbidden normal-product behavior that selects a substantially predesigned deck and swaps in topic text while presenting the result as agent-designed. Reusable design primitives, exemplars, fonts, and tokens are not Template Substitution when the Agent Director still makes the task-specific design decisions.
_Avoid_: fast generation, deterministic recovery

**Design Primitive**:
A reusable low-level capability such as a font, token, icon, chart type, media operation, or atomic layout tool that the Agent Director may combine while creating a task-specific page structure and composition.
_Avoid_: completed slide template, precomposed deck

**OpenKimi Reference Pack**:
The pinned PPTD specification, agent instructions, design guidance, and fixtures used to teach and test the Agent Director. It is reference material, not the production runtime.
_Avoid_: OpenKimi engine, OpenKimi backend

## Presentation document

**PPTD Project**:
A YAML PPTD v2 project tree containing the presentation, pages, and media; it is the sole persisted document truth.
_Avoid_: Deck JSON, bitmap deck

**Dual IR**:
Two independently writable presentation models that can diverge. Dual IR is forbidden.
_Avoid_: synchronized deck models

**Hybrid Export**:
Conversion of a PPTD Project into a PowerPoint file whose content remains natively editable, with explicit reporting for any degraded feature.
_Avoid_: screenshot export, full-page raster PPTX

**Edit Data**:
The PowerPoint behavior that lets a user reopen and modify a chart's embedded data after export.
_Avoid_: flattened chart, chart screenshot

**Self Canvas**:
The native Open SlideStudio renderer and editor that reads and writes the PPTD Project directly.
_Avoid_: embedded office suite, official Kimi editor

## Interaction evidence

**Dual-channel oracle**:
Evidence that combines visible before-and-after states with document or export changes for the same interaction.
_Avoid_: screenshot-only proof, schema-only proof

**Interaction Row**:
One observable editor interaction, including its trigger, states, effect, evidence, implementation status, and verification result.
_Avoid_: feature claim, button inventory

**Verified**:
An Interaction Row whose native behavior and visible states pass its recorded evidence and tests.
_Avoid_: implemented, looks done

**Surface S0-S13**:
The ordered inventory used to exhaustively cover the captured Kimi editor surface.
_Avoid_: sample screens, representative controls

**Dead Button**:
A visible interactive control without the specified behavior and states of a verified Interaction Row. Dead buttons are forbidden.
_Avoid_: placeholder control, coming-soon click target
