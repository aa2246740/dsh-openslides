# Creation input and verified reference catalog

This boundary implements the input portion of the 2026-09-14 remediation contract. It does not itself prove model execution, page QA, or export delivery.

## Ownership

- YAML PPTD v2 remains the editable document SSOT.
- `_agent/generation-input.v1.json` is an immutable creation-input snapshot, not another editable presentation model. It records the original brief, canvas, initial model selection, explicit style provenance or self-directed intent, selected text references, and prepared initial message.
- The snapshot is created with exclusive file creation. Changing the current model must not rewrite it.
- Message and content-block hashes describe the prepared input. They are not proof that a provider consumed it. Actual DSH/model execution still requires session evidence.

## Public creation boundary

`POST /slides/sessions` accepts `brief`, `kind`, `layout`, optional `designSystemId`, `provider`, `model`, optional `reasoningEffort`, and `attachments`.

- Supported formats are Slides 16:9 at 960×540 and Slides 4:3 at 720×540. Omitted legacy format fields default to Slides 16:9. Docs, Report, Adaptive, and other explicit values are rejected.
- Attachment selections are IDs or objects containing an ID. Caller-provided text is not used. Duplicate IDs are rejected.
- The Host resolves every selected ID against its configured local native upload service and verifies the upload-store identity and parsing receipt before creating an Agent.
- Unsupported, incomplete, changed, unowned, missing, or over-budget references reject the whole request. There is no partial-success clipping.
- The same resolver runs before attachment-bearing turn requests cancel waits or load a session. Full model-switch/recovery serialization is a separate remediation item.
- The created PPTD manifest receives the actual canvas dimensions and contains zero composed pages. Project creation does not author slide content. An unclaimed colliding directory is not reused.

## Native upload boundary

The product Hub exposes native routes beneath `/app/api/attachments`. Host-to-sidecar requests use the configured native origin's `/api/attachments` route.

The native store preserves original bytes plus a durable metadata receipt. It fully decodes UTF-8 `.txt`, `.md`, `.csv`, `.tsv`, and `.json` text, preserving rows and blank lines. JSON is delivered as original text, not presented as a validated structured JSON document. Images, Office files, invalid UTF-8, and text exceeding the explicit parser budget are rejected rather than labeled parsed.

The receipt records `storeId`, original byte count and SHA-256, extracted text length and SHA-256, `parser: utf8-full-v1`, `parsed`, and `complete`. Reads revalidate the original file and extraction. Symlinks, foreign store markers, and unverified owner markers are rejected. Only receipt fields and text are returned, never an arbitrary server path. Malformed base64 is rejected rather than repaired.

The parser limit is 48,000 UTF-16 code units per file. The Host separately limits the complete serialized attachment JSON context to 48,000 characters, including identifiers, names and JSON escaping. This can reject multiple individually readable files. It never truncates one into an apparently successful request.

## Catalog boundary

`GET /slides/catalog` returns the version-1 format/style DTO defined in the remediation contract. Source and visual bytes are checked against the pinned manifests.

The real pinned catalog contains 30 group/slug `design.md` guides and 14 numbered English guides in the `extra` preview namespace. The latter are not missing or fabricated designs: their exact source/preview relationships are recorded in `vendor/open-kimi-ppt/git-pre-wipe/theme.md`, starting at its supplementary index. Resolution requires the exact numbered English path shape and slug, and refuses ambiguity. It does not use a first substring match. Tests verify all 44 pairs against that independent index.

Each preview URL identifies one manifest source. The response sends the same bytes whose hash and size were verified, with a hash ETag and revalidation policy. It does not substitute a fallback thumbnail. Exact style IDs serve as labels where no separate localized label has been verified.

## Remaining acceptance

These input checks are technical regressions, not real-model acceptance. The full remediation still requires native-editor recovery integration, current plan/QA/compose/export gates, a refreshed browser run on the integrated product, and fresh provider-authored editable PPTX evidence.
