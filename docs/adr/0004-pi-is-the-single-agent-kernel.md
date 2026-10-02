---
status: superseded
superseded-by: 0009-dsh-is-the-single-agent-kernel
---

# Pi is the single production Agent Kernel

Superseded for kernel *selection* by [ADR-0009](0009-dsh-is-the-single-agent-kernel.md). The single-kernel rule remains. The production kernel becomes DeepSeek Harness `0.1.5-rc.2`. Keep this file as the Pi-era record. Hub generate may still use `createPiBrain` until that cutover's Phase 1 exit.

Open SlideStudio uses a version-pinned Pi runtime as its only production Agent Kernel. Pi owns model sessions, context management, tool calls, provider authentication, retries, and resume behavior; Open SlideStudio supplies the PPT-specific skill, hands, persistence, native renderer, validation, editor, and exporter.

The Pi version and its production dependencies are delivered with the product or its offline package. A production installation must not download Pi from a public registry at startup.

Development may reuse the owner's existing local Pi installation when its version and capabilities match the product pin. That convenience does not become a production dependency. At the time of this decision, the observed local development runtime is `@earendil-works/pi-coding-agent` `0.80.10`.

## Considered options

- Use Pi as the single Agent Kernel.
- Keep the custom in-process agent loop as the kernel and use Pi only for some providers.
- Maintain both orchestration paths as equal product modes.

The first option is accepted. Two orchestration paths create different tool clocks, failure semantics, context behavior, and quality claims; this is a runtime form of dual truth.

## Consequences

- BYOK and supplier-supported OAuth enter through Pi's provider model rather than creating another agent loop. They are Provider Connections; the local-first product has no Open SlideStudio account or tenant login.
- The custom agent loop is removed from production generation or retained only as isolated migration/test code until deletion.
- A successful Agent Run must carry Pi session and tool evidence; selecting a provider must not change the orchestration contract.
- Pi upgrades require an explicit compatibility and regression pass before the pinned version changes.
- The first Authentic Generation vertical slice may use whichever configured provider works end to end. Breadth across every provider shown in the current UI is not a prerequisite for proving that slice, although the final connection surface must support both API-key and OAuth-capable suppliers.
- Open SlideStudio does not disable research capabilities merely because they are provider-native. The run capability-detects what the selected Pi provider and model expose; when native search is unavailable, the Agent Director may use product-supplied research tools. Generation Provenance records what was actually available and used.
- During development, the product may detect and reuse the owner's compatible local Pi session. The shipped Provider Connection experience remains inside Open SlideStudio, supports BYOK and supplier OAuth without requiring terminal commands, and does not depend on a global Pi installation.
