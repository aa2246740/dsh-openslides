# Generated page contract

Model tool calls are untrusted structured input. The native PPTD page document remains the persisted source of truth.

## Shared definition

`packages/pptd-v2/src/write-page-schema.ts` owns the generated page parameter specification and its semantic validator. It does not depend on DSH. The host uses that specification to declare `write_page`; it also validates the received arguments before reading or mutating the project. Native text, shape, image, table, chart, icon and line fields are described explicitly. Unknown fields are rejected instead of silently discarded.

The shared definition compiles to standard JSON Schema for the model, including tuple minItems/maxItems. The executor declaration lowers only these unsupported cardinality keywords to the DSH author-schema subset; the published tool parameters retain them. Tuple lengths, positive bounds, unique element IDs and table/chart dimensional consistency are independently checked by the shared validator. Model adherence is not assumed merely because a schema was sent.

## Persistence fidelity

`presentation-run` validates the native page shape against the same shared contract before running legacy dialect conversion. Valid native pages are cloned intact, including background, speaker notes, animations and all elements, so `read_page` can provide a lossless editing baseline. Existing legacy inputs still use the existing conversion path. The host's strict generation boundary prevents invalid new tool input from falling through that permissive legacy path.

Tests compare complete native objects for all seven element kinds, including properties previously dropped by the converter. This is a persistence guarantee; layout, actual rendering and editable export retain their own validation gates.

## Human review edit scope

The native editor persists comment targets as immutable page/element identities plus revision
and page SHA. Its short-lived `_agent/ai-review-lock.v1.json` carries the authoritative scope
into the generation writer. The native review API owns capture, stale-target rejection and
final verification; client text is not the scope authority.

`persistWrittenPages` checks this guard inside the project write lock before changing any file.
Every scoped write requires a current SHA and one existing authorized page. Element-scoped
writes preserve page metadata, element membership/order and every unselected element exactly.
Explicit page/deck scope can edit only the recorded existing page IDs. Review writes preserve
the deck title instead of restoring the original generation brief. A `review_scope_violation`
returns actionable feedback without touching the page, deck or in-memory accepted-page list.
The editor still verifies the final result before marking a comment applied; no-op output is
not successful application. These checks supplement, rather than rely on, model instructions.

Element review turns publish `edit_elements({pageId, expectedPageSha256, elements})` using
the same canonical element schema. The submitted array contains exactly the authorized
existing elements. The Host merges these replacements into the authoritative page in their
original positions, then invokes the same `write_page` executor, receipt and persistence guard.
It never asks the model to copy unrelated page content for an element-only change. The tool
is absent from ordinary generation turns and rejects expired scopes, stale SHAs, unknown,
duplicate or out-of-scope IDs. Whole-page and deck edits continue to use `write_page`.

## Tool call identity

Model argument objects must have the tool's declared fields at the top level. The product must not execute an unwrapped local copy while replaying the original wrapped object as a successful assistant tool call. Undeclared top-level `arguments` envelopes fail with actionable `INVALID_ARGS` feedback. Tools genuinely declaring that field keep their own contract. The original model output is not rewritten to manufacture compliance.

Old sessions may contain successful examples of malformed tool calls from the removed compatibility behavior. Changing the prompt or increasing the unwrapping limit does not remove those examples. Fresh-session comparison is required for provider diagnosis; old sessions and user artifacts remain available as evidence.

## Acceptance

Shared-schema tests, adapter identity tests and no-progress safeguards establish local invariants. They do not establish any external model's reliability. Release acceptance additionally requires controlled real provider comparisons and an actual complete presentation generated through the product, with visible page review and editable export checks.

## Bounded correction

Three consecutive repetitions of the same normalized tool argument error pause the agent. Different error fingerprints represent separate correction attempts and do not trip that repetition threshold. A separate phase-wide no-progress budget still bounds changing errors and read-only loops. Tool errors never count as persisted page progress.

## Render and export agreement

The PPTD shape catalog owns canonical names and explicit aliases. New page writes publish this supported set; reading historical files keeps its existing behavior. The Web shape path and native PPTX mapper resolve the same aliases, so a rectangle fills its declared bounds in both outputs. Native raster QA defaults to logical slide dimensions rather than editor fit coordinates, so corrective feedback uses the same units as write_page.

Editable export must preserve geometry as well as object counts. Line evidence records the source bounds/viewBox/points and emitted custom geometry; unsupported paths must report a hard geometry failure instead of silently becoming horizontal or vertical. Final artifact checks inspect OOXML and the current source revision, not only the exporter success flag.
