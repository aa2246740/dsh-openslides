import fs from "node:fs";
import path from "node:path";
import { withProjectWriteLock, loadProject } from "@open-slidestudio/pptd-v2";
import { persistPageKey } from "./page-identity.js";
import { pageIdMatchesFile } from "./layout-qa.js";
import { quarantineCorruptFile, writeJsonAtomic, } from "./atomic-file.js";
import { parseCanonicalPagePlan } from "./page-plan.js";
import { conversationPageCount } from "./conversation-requirements.js";
import { executeGenerateTool, executeGenerateToolAsync, persistWrittenPages, } from "./agent-tools.js";
import { inspectProjectCapabilities } from "../capabilities.js";
import { createPageRasterPort } from "./page-raster.js";
import { loadPlaybook } from "./playbook.js";
import { createImagePort, grokImageConfigFromEnv, imageConfigFromEnv } from "./image-port.js";
import { createImageSearchPort } from "./image-search-port.js";
import { createGrokImageSearchPort, grokWebSearch } from "./grok-hosted.js";
import { resolveRepoRoot } from "../catalog.js";
import { listOpenKimiSourceRequirements, readOpenKimiSourceChunk, resolveOpenKimiPresetDesignSourceId, verifyOpenKimiPack, } from "./openkimi-source-pack.js";
import { MISSING_HOSTED_WEB_SEARCH_RECEIPT, briefNeedsLiveWebSearch, hostedResearchNeedsWebSearchReceipt, ledgerHasSuccessfulWebSearch, webSearchQueriesFromArgs, } from "./hosted-web-search.js";
import { bytesSha256, contextFromToolArgs, currentPageRevision, ensureRunLedger, inspectRunLedger, pageRewriteGate, readRunLedger, recordCompose, recordImageEmitted, recordImagePrepared, recordPageRevision, recordRaster, recordReferenceChunk, recordStructuralReview, recordTodo, recordVisualReview, recordWebSearchExecuted, requireComposeReady, requireReferencesComplete, requireTodo, stableSha256, } from "./run-ledger.js";
export const DOMAIN_TOOL_NAMES = [
    "think",
    "list_references",
    "read_reference",
    "write_todo",
    "write_page",
    "render_page",
    "review_page",
    "review_pages",
    "compose_deck",
    "delete_pages",
    "reorder_pages",
    "update_deck",
];
const OPTIONAL_PORT_TOOLS = ["search_image", "generate_image", "web_search"];
const INTERNAL_TOOLS = ["_mark_image_emitted"];
const HANDS_STATE_REL = path.join("_agent", "hands-state.json");
const RUNTIME_REL = path.join("_agent", "runtime.json");
const OUTLINE_REL = path.join("_agent", "outline.json");
export function writeDomainRuntime(root, runtime) {
    writeJsonAtomic(path.join(root, RUNTIME_REL), runtime);
    if (runtime.strictExecution)
        initializeRunLedger(root);
}
function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}
function loadRuntime(root) {
    const file = path.join(root, RUNTIME_REL);
    if (fs.existsSync(file)) {
        const rec = readJson(file);
        const designDirection = rec.designDirection === "self-directed" ||
            rec.designDirection === "user-design" ||
            rec.designDirection === "preset"
            ? rec.designDirection
            : undefined;
        const categoryId = typeof rec.categoryId === "string" ? rec.categoryId.trim() : "";
        const designSystemId = typeof rec.designSystemId === "string" ? rec.designSystemId.trim() : "";
        return {
            brief: String(rec.brief ?? "").trim(),
            categoryId: categoryId || undefined,
            designSystemId: designSystemId || undefined,
            editorBaseUrl: rec.editorBaseUrl,
            designDirection,
            strictExecution: rec.strictExecution === true,
        };
    }
    const briefFile = path.join(root, "_agent", "brief.txt");
    return {
        brief: fs.existsSync(briefFile) ? fs.readFileSync(briefFile, "utf8").trim() : "",
    };
}
function repositoryRoot() {
    return resolveRepoRoot();
}
export function hasExplicitUserDesign(brief) {
    return /(?:配色|色系|主色|辅色|颜色|视觉风格|字体|字号|版式|页面比例|16\s*[:：]\s*9|#[0-9a-f]{3,8}|深蓝|海军蓝|藏蓝|琥珀金|金色|白底|黑底)/i.test(brief);
}
function resolveDesignDirection(runtime, pack) {
    if (runtime.designDirection === "self-directed") {
        return { kind: "self-directed" };
    }
    // A color, font, ratio, or layout hint is an override. It is not a complete
    // design system and must never remove the selected OpenKimi design source.
    return {
        kind: "preset",
        sourceId: resolveOpenKimiPresetDesignSourceId(pack, runtime.designSystemId ?? ""),
    };
}
function toLedgerRequirement(pack, requirement) {
    const entry = pack.entriesById.get(requirement.sourceId);
    if (!entry)
        throw new Error(`OpenKimi requirement is missing: ${requirement.sourceId}`);
    return {
        sourceId: requirement.sourceId,
        fileSha256: entry.sha256,
        chunkIndexes: requirement.requiredChunkIndexes,
        reason: requirement.kind === "categories" ? "category-guide" : requirement.kind,
    };
}
export function initializeRunLedger(root) {
    const runtime = loadRuntime(root);
    const repoRoot = repositoryRoot();
    const pack = verifyOpenKimiPack(repoRoot);
    const designDirection = resolveDesignDirection(runtime, pack);
    const requirements = listOpenKimiSourceRequirements(pack, {
        ...(runtime.categoryId ? { categoryId: runtime.categoryId } : {}),
        designDirection,
    }).map((requirement) => toLedgerRequirement(pack, requirement));
    const executionPolicy = {
        currentRenderedLayoutRequired: runtime.strictExecution === true && Boolean(runtime.editorBaseUrl?.trim()),
        structuralReviewRequired: runtime.strictExecution === true,
    };
    ensureRunLedger(root, {
        manifestSha256: bytesSha256(fs.readFileSync(pack.manifestPath)),
        requirementsId: stableSha256({ requirements }),
        requirements,
        executionPolicy,
    });
}
function loadHandsState(root) {
    const file = path.join(root, HANDS_STATE_REL);
    if (!fs.existsSync(file)) {
        return { todos: [], writtenPages: [] };
    }
    let rec;
    try {
        rec = readJson(file);
    }
    catch {
        // A torn buffer is a cache, not authority — quarantine it and start empty
        // rather than poisoning every subsequent tool call. Strict gates still read
        // the ledger, so an empty hands-state denies rather than grants.
        quarantineCorruptFile(file);
        return { todos: [], writtenPages: [] };
    }
    return {
        todos: Array.isArray(rec.todos) ? rec.todos : [],
        writtenPages: Array.isArray(rec.writtenPages) ? rec.writtenPages : [],
        skillDeck: rec.skillDeck,
    };
}
function saveHandsState(root, state) {
    writeJsonAtomic(path.join(root, HANDS_STATE_REL), state);
}
function buildToolState(root) {
    const runtime = loadRuntime(root);
    const saved = loadHandsState(root);
    const ledger = readRunLedger(root);
    let todos = saved.todos;
    if (ledger) {
        const todo = ledger.facts.filter((fact) => fact.type === "todo.committed").at(-1);
        try {
            todos = parseCanonicalPagePlan(todo?.pagePlan).map((page) => ({ ...page, exhibits: [...page.exhibits] }));
        }
        catch {
            todos = [];
        }
        // Structural edit turns grow the manifest beyond the committed plan. Teach
        // the plan about pages that now exist on disk so gates and prompts see the
        // real page set. Union, not replace: mid-generation the disk is still a
        // subset of the plan and committed entries must not drop out. Only a real
        // committed plan earns this sync — a bare hands-state never gated on plans.
        if (todos.length) {
            try {
                const project = loadProject(root);
                const known = new Set(todos.map((todo) => persistPageKey(String(todo.pageId ?? ""))).filter((key) => key.length > 0));
                const extras = project.pages
                    .map((loaded) => persistPageKey(loaded.path))
                    .filter((id) => id.length > 0 && !known.has(id))
                    .map((id) => ({ pageId: id, title: id }));
                if (extras.length)
                    todos = [...todos, ...extras];
            }
            catch {
                // The project may not exist yet during early generation.
            }
        }
    }
    const attach = path.join(root, "_agent", "attachments.md");
    const caps = inspectProjectCapabilities(root);
    return {
        brief: runtime.brief,
        requestedPageCount: conversationPageCount(root),
        playbook: loadPlaybook({
            categoryId: runtime.categoryId,
            designSystemId: runtime.designSystemId,
            hostDefaults: false,
        }),
        referenceText: fs.existsSync(attach) ? fs.readFileSync(attach, "utf8") : undefined,
        todos,
        researchNotes: [],
        writtenPages: saved.writtenPages,
        skillDeck: saved.skillDeck,
        strictLedger: Boolean(ledger),
        projectRoot: root,
        userExplicitPack: runtime.designDirection === "preset" || runtime.designDirection === "user-design",
        // The persisted editorBaseUrl can be stale across sidecar restarts (the
        // port moves); the kernel's own env carries the live value. Prefer it.
        raster: createPageRasterPort({ editorBaseUrl: process.env.SLIDESTUDIO_EDITOR_URL?.trim() || runtime.editorBaseUrl }),
        image: caps.imageGenerate.configured
            ? createImagePort(caps.imageGenerate.via === "pi-xai-hosted" ? grokImageConfigFromEnv() : imageConfigFromEnv())
            : undefined,
        imageSearch: caps.imageSearch.configured
            ? caps.imageSearch.via === "pi-xai-hosted"
                ? createGrokImageSearchPort()
                : createImageSearchPort()
            : undefined,
        webSearch: caps.research.configured && caps.research.via === "pi-xai-hosted"
            ? { search: (query) => grokWebSearch(query) }
            : undefined,
    };
}
/** Explicit compose payloads may add/revise pages, but unchanged historical
 * hands-state pages are observations, not permission to overwrite editor work. */
function explicitComposeMutations(state, result) {
    const payload = result.payload;
    if (!payload || !Array.isArray(payload.pages))
        return [];
    const historical = state.writtenPages ?? [];
    return payload.pages.filter((page) => {
        if (!page || typeof page.id !== "string")
            return false;
        const prior = historical.find((item) => item.id === page.id);
        // A compose after write_page is not an implicit edit permission for a
        // historical page: Native may have changed it after hands-state was read.
        // Compose may still append pages which this run has never written.
        return !prior;
    });
}
function persistFromState(root, state, pageMutations) {
    saveHandsState(root, {
        todos: state.todos,
        writtenPages: state.writtenPages ?? [],
        skillDeck: state.skillDeck,
    });
    if (state.todos.length) {
        writeJsonAtomic(path.join(root, OUTLINE_REL), { items: state.todos });
    }
    // An explicit compose with no appended pages still owns its deck metadata
    // (notably the title), while ordinary tools must not replay prior pages.
    if (pageMutations)
        persistWrittenPages(state, pageMutations);
}
function failedTool(name, error) {
    const detail = error instanceof Error ? error.message : String(error);
    let payload = { error: detail };
    if (name === "review_page" &&
        /image was not emitted|matching raster evidence|stale page revision|delivery token/i.test(detail)) {
        payload = {
            error: "review_page_evidence_missing",
            next: "render_page",
            detail,
        };
    }
    else if (name === "review_page" && /passing page review cannot contain unresolved issues/i.test(detail)) {
        payload = {
            error: "review_page_issues_conflict",
            next: "review_page",
            issuesContract: "verdict=pass requires issues=[]; verdict=revise requires concrete unresolved defects",
            detail,
        };
    }
    else if (name === "review_page" && /revise page review must name at least one issue/i.test(detail)) {
        payload = {
            error: "review_page_issues_required",
            next: "review_page",
            issuesContract: "verdict=revise requires one or more concrete unresolved visual defects",
            detail,
        };
    }
    return {
        name,
        ok: false,
        summary: "execution gate rejected",
        detail,
        payload,
    };
}
function loggedToolExecution(root, name, args, result) {
    appendHandsLog(root, {
        at: new Date().toISOString(),
        name,
        ok: result.ok,
        summary: result.summary,
        detail: result.ok ? undefined : result.detail,
        keys: Object.keys(args),
        args: JSON.stringify(args).slice(0, 1500),
    });
    return result;
}
function safeProjectFile(root, relativePath) {
    const absoluteRoot = path.resolve(root);
    const candidate = path.resolve(absoluteRoot, relativePath);
    if (candidate === absoluteRoot || !candidate.startsWith(`${absoluteRoot}${path.sep}`)) {
        throw new Error(`project file escapes the run root: ${relativePath}`);
    }
    return candidate;
}
function issueStrings(value) {
    if (!Array.isArray(value))
        return [];
    return value.map((item) => {
        if (typeof item === "string")
            return item;
        if (!item || typeof item !== "object")
            return String(item);
        const rec = item;
        const pageId = typeof rec.pageId === "string" ? `${rec.pageId}: ` : "";
        const message = typeof rec.message === "string" ? rec.message : JSON.stringify(rec);
        return `${pageId}${message}`;
    });
}
const MISPLACED_PAGE_STYLE_KEYS = new Set([
    "align",
    "bold",
    "color",
    "fill",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "item",
    "layoutRole",
    "letterSpacing",
    "line",
    "lineHeight",
    "position",
    "rect",
    "text",
    "value",
]);
function requireWholePageWriteArgs(args) {
    const misplaced = Object.keys(args)
        .filter((key) => MISPLACED_PAGE_STYLE_KEYS.has(key))
        .sort();
    if (!misplaced.length)
        return;
    throw new Error(`write_page received element fields at page level: ${misplaced.join(", ")}. ` +
        "write_page replaces the entire page; send one complete elements[] array for the page. " +
        "Put text, style, bounds, fill, line, alignment, and layoutRole inside their owning element.");
}
function layoutEvidence(value) {
    if (!value || typeof value !== "object")
        return { status: "unavailable", issues: [] };
    const rec = value;
    const issues = [];
    if (Array.isArray(rec.hardIssues)) {
        for (const raw of rec.hardIssues) {
            if (!raw || typeof raw !== "object")
                continue;
            const item = raw;
            const id = typeof item.elementId === "string" ? [item.elementId] : [];
            issues.push({
                code: String(item.kind ?? "rendered-layout-error"),
                severity: "error",
                elementIds: id,
                detail: String(item.detail ?? "rendered layout failed"),
            });
        }
    }
    if (Array.isArray(rec.warnings)) {
        for (const raw of rec.warnings) {
            if (!raw || typeof raw !== "object")
                continue;
            const item = raw;
            const ids = Array.isArray(item.elementIds)
                ? item.elementIds.filter((id) => typeof id === "string")
                : [];
            issues.push({
                code: String(item.kind ?? "rendered-layout-warning"),
                severity: "warning",
                elementIds: ids,
                detail: String(item.detail ?? "rendered layout warning"),
            });
        }
    }
    return {
        status: rec.checked === true ? (rec.ok === true ? "pass" : "fail") : "unavailable",
        issues,
    };
}
function listReferencesResult(root, context) {
    const ledger = readRunLedger(root);
    if (!ledger)
        throw new Error("run ledger is not initialized");
    const pack = verifyOpenKimiPack(repositoryRoot());
    const status = inspectRunLedger(root, context.contextEpochId);
    const missing = new Set(status.missingReferenceChunks.map((item) => `${item.sourceId}#${item.chunkIndex}`));
    const sources = ledger.sourcePack.requirements.map((requirement) => {
        const entry = pack.entriesById.get(requirement.sourceId);
        if (!entry)
            throw new Error(`required source is absent: ${requirement.sourceId}`);
        return {
            sourceId: requirement.sourceId,
            relativePath: entry.relativePath,
            reason: requirement.reason,
            byteLength: entry.byteLength,
            fileSha256: entry.sha256,
            chunks: requirement.chunkIndexes.map((chunkIndex) => ({
                chunkIndex,
                readInThisContext: !missing.has(`${requirement.sourceId}#${chunkIndex}`),
            })),
        };
    });
    const detail = sources
        .map((source) => `${source.sourceId} | ${source.reason} | ${source.byteLength} bytes | chunks ${source.chunks
        .map((chunk) => `${chunk.chunkIndex}${chunk.readInThisContext ? "✓" : ""}`)
        .join(",")}`)
        .join("\n");
    return {
        name: "list_references",
        ok: true,
        summary: `${sources.length} required original files`,
        detail,
        payload: { referencesComplete: status.referencesComplete, sources },
    };
}
function readReferenceResult(root, context, args) {
    const sourceId = String(args.sourceId ?? "").trim();
    const chunkIndex = Number(args.chunkIndex);
    if (!sourceId || !Number.isSafeInteger(chunkIndex) || chunkIndex < 0) {
        throw new Error("read_reference requires sourceId and a non-negative integer chunkIndex");
    }
    const pack = verifyOpenKimiPack(repositoryRoot());
    const chunk = readOpenKimiSourceChunk(pack, sourceId, chunkIndex);
    recordReferenceChunk(root, context, {
        sourceId: chunk.sourceId,
        fileSha256: chunk.fileSha256,
        chunkIndex: chunk.index,
        chunkSha256: chunk.sha256,
    });
    return {
        name: "read_reference",
        ok: true,
        summary: `${chunk.relativePath} #${chunk.index}`,
        detail: [
            `ORIGINAL SOURCE ${chunk.sourceId}`,
            `chunk ${chunk.index} bytes ${chunk.byteStart}-${chunk.byteEndExclusive} sha256 ${chunk.sha256}`,
            "",
            chunk.text,
        ].join("\n"),
        payload: {
            sourceId: chunk.sourceId,
            relativePath: chunk.relativePath,
            chunkIndex: chunk.index,
            byteStart: chunk.byteStart,
            byteEndExclusive: chunk.byteEndExclusive,
            chunkSha256: chunk.sha256,
            fileSha256: chunk.fileSha256,
            text: chunk.text,
        },
    };
}
function requireHostedWebSearchBeforeWrite(root) {
    const research = inspectProjectCapabilities(root).research;
    if (!hostedResearchNeedsWebSearchReceipt(research))
        return;
    if (!briefNeedsLiveWebSearch(loadRuntime(root).brief))
        return;
    if (ledgerHasSuccessfulWebSearch(readRunLedger(root)))
        return;
    throw new Error(MISSING_HOSTED_WEB_SEARCH_RECEIPT);
}
export async function runDomainHand(name, args, root) {
    if (!DOMAIN_TOOL_NAMES.includes(name) &&
        !OPTIONAL_PORT_TOOLS.includes(name) &&
        !INTERNAL_TOOLS.includes(name)) {
        return {
            name,
            ok: false,
            summary: "unknown tool",
            detail: `not a slides domain tool: ${name}`,
            payload: { error: `unknown tool: ${name}` },
        };
    }
    const strict = Boolean(readRunLedger(root));
    // strictExecution is declared by runtime.json; a missing/corrupt ledger must
    // not silently downgrade the run to the permissive path — fail closed.
    if (!strict && loadRuntime(root).strictExecution === true) {
        return loggedToolExecution(root, name, args, failedTool(name, "strict execution requires an initialized run ledger"));
    }
    let context;
    let cleanArgs = args;
    if (strict) {
        try {
            const extracted = contextFromToolArgs(args);
            context = extracted.context;
            cleanArgs = extracted.args;
            if (name === "list_references") {
                return loggedToolExecution(root, name, cleanArgs, listReferencesResult(root, context));
            }
            if (name === "read_reference") {
                return loggedToolExecution(root, name, cleanArgs, readReferenceResult(root, context, cleanArgs));
            }
            if (name === "_mark_image_emitted") {
                const deliveryToken = String(cleanArgs.deliveryToken ?? "").trim();
                if (!deliveryToken)
                    throw new Error("deliveryToken is required");
                const fact = recordImageEmitted(root, context, deliveryToken);
                const subject = `${fact.pageId} revision ${fact.revision}`;
                return loggedToolExecution(root, name, cleanArgs, {
                    name,
                    ok: true,
                    summary: `${subject} image emitted`,
                    detail: `${subject} image content emitted`,
                    payload: fact,
                });
            }
            if (name === "review_page") {
                const pageId = String(cleanArgs.pageId ?? "").trim();
                const revision = Number(cleanArgs.revision);
                const deliveryToken = String(cleanArgs.deliveryToken ?? "").trim();
                const verdict = cleanArgs.verdict;
                const issues = Array.isArray(cleanArgs.issues)
                    ? cleanArgs.issues.filter((issue) => typeof issue === "string")
                    : [];
                if (!pageId || !Number.isSafeInteger(revision) || revision < 1 || !deliveryToken) {
                    throw new Error("review_page requires pageId, revision, and deliveryToken");
                }
                if (verdict !== "pass" && verdict !== "revise") {
                    throw new Error("review_page verdict must be pass or revise");
                }
                const fact = recordVisualReview(root, context, {
                    pageId,
                    revision,
                    deliveryToken,
                    verdict,
                    issues,
                });
                return loggedToolExecution(root, name, cleanArgs, {
                    name,
                    ok: true,
                    summary: `${pageId} ${verdict}`,
                    detail: verdict === "pass"
                        ? `${pageId} revision ${revision} visual review passed`
                        : `${pageId} revision ${revision} must be rewritten: ${issues.join("; ")}`,
                    payload: fact,
                });
            }
            if (name === "write_todo") {
                const planContext = context;
                return withProjectWriteLock(root, () => {
                    requireReferencesComplete(root, planContext.contextEpochId);
                    const items = parseCanonicalPagePlan(cleanArgs.items);
                    const committed = recordTodo(root, planContext, items);
                    return loggedToolExecution(root, name, cleanArgs, {
                        name, ok: true, summary: `${committed.length} pages planned`,
                        detail: committed.map((page) => `${page.pageId}: ${page.title}`).join("\n"),
                        payload: { items: committed, plannedPageIds: committed.map((page) => page.pageId) },
                    });
                });
            }
            if (name === "write_page") {
                requireTodo(root);
                requireWholePageWriteArgs(cleanArgs);
                requireHostedWebSearchBeforeWrite(root);
                const pageId = String(cleanArgs.id ?? "").trim();
                const rewrite = pageRewriteGate(root, pageId);
                if (!rewrite.allowed)
                    throw new Error(rewrite.reason);
            }
            if (name === "compose_deck")
                requireComposeReady(root, context.contextEpochId);
        }
        catch (error) {
            return loggedToolExecution(root, name, cleanArgs, failedTool(name, error));
        }
    }
    else if (name === "list_references" ||
        name === "read_reference" ||
        name === "review_page" ||
        name === "_mark_image_emitted") {
        return loggedToolExecution(root, name, cleanArgs, failedTool(name, "run ledger is not initialized"));
    }
    const state = buildToolState(root);
    let result;
    try {
        const executionArgs = strict && name === "compose_deck"
            ? { title: String(cleanArgs.title ?? "").trim() }
            : cleanArgs;
        result =
            name === "render_page" || name === "search_image" || name === "generate_image" || name === "web_search"
                ? await executeGenerateToolAsync(name, executionArgs, state)
                : executeGenerateTool(name, executionArgs, state);
        const pageMutations = name === "compose_deck" && result.ok
            ? explicitComposeMutations(state, result)
            : [];
        persistFromState(root, state, name === "compose_deck" && result.ok ? pageMutations : undefined);
        if (strict && context && result.ok) {
            if (name === "web_search") {
                const payload = (result.payload ?? {});
                const queries = webSearchQueriesFromArgs(payload);
                recordWebSearchExecuted(root, context, {
                    queries,
                    factCount: Array.isArray(payload.facts) ? payload.facts.length : 0,
                });
            }
            else if (name === "write_page") {
                const page = result.payload?.page;
                if (!page?.id)
                    throw new Error("write_page succeeded without a page payload");
                // Bind the revision fact to the persisted file, not the tool payload:
                // reload the page that was just written and hash the on-disk revision.
                const persisted = loadProject(root).pages.find((entry) => pageIdMatchesFile(page.id, entry.path));
                if (!persisted) {
                    throw new Error(`write_page persisted no page file for ${page.id}`);
                }
                const canonicalId = persistPageKey(persisted.path);
                recordPageRevision(root, context, canonicalId, {
                    ...persisted.page,
                    id: canonicalId,
                });
            }
            else if (name === "render_page") {
                const payload = (result.payload ?? {});
                const { dataUrl: _legacyDataUrl, ...transportPayload } = payload;
                const pageId = String(payload.pageId ?? "").trim();
                const src = String(payload.src ?? "").trim();
                const page = currentPageRevision(root, pageId);
                if (!page || !src)
                    throw new Error("render_page did not return a current page raster");
                const abs = safeProjectFile(root, src);
                const bytes = fs.readFileSync(abs);
                const layout = layoutEvidence(payload.layout);
                const recorded = recordRaster(root, page, {
                    bytes,
                    src,
                    width: Number(payload.width ?? 0),
                    height: Number(payload.height ?? 0),
                    layoutStatus: layout.status,
                    layoutIssues: layout.issues,
                });
                recordImagePrepared(root, context, recorded.fact, recorded.deliveryToken);
                const layoutDetail = recorded.fact.layoutIssues.length
                    ? recorded.fact.layoutIssues
                        .map((issue) => `- ${issue.code}: ${issue.detail}`)
                        .join("\n")
                    : "- none";
                result = {
                    ...result,
                    detail: [
                        result.detail,
                        `revision: ${page.revision}`,
                        `rasterSha256: ${recorded.fact.rasterSha256}`,
                        `layoutStatus: ${recorded.fact.layoutStatus}`,
                        "layoutIssues:",
                        layoutDetail,
                        `DELIVERY_TOKEN: ${recorded.deliveryToken}`,
                    ].join("\n"),
                    payload: {
                        ...transportPayload,
                        pageRevision: page.revision,
                        pageSha256: page.pageSha256,
                        rasterSha256: recorded.fact.rasterSha256,
                        deliveryToken: recorded.deliveryToken,
                        layoutStatus: recorded.fact.layoutStatus,
                        layoutIssues: recorded.fact.layoutIssues,
                    },
                };
            }
            else if (name === "review_pages") {
                const payload = (result.payload ?? {});
                recordStructuralReview(root, true, issueStrings(payload.issues));
            }
            else if (name === "compose_deck") {
                recordCompose(root, context, String(cleanArgs.title ?? "").trim());
            }
        }
        else if (strict && name === "review_pages") {
            const payload = (result.payload ?? {});
            recordStructuralReview(root, false, issueStrings(payload.issues));
        }
    }
    catch (error) {
        result = failedTool(name, error);
    }
    finally {
        await state.raster?.close?.();
    }
    appendHandsLog(root, {
        at: new Date().toISOString(),
        name,
        ok: result.ok,
        summary: result.summary,
        detail: result.ok ? undefined : result.detail,
        keys: Object.keys(cleanArgs),
        args: JSON.stringify(cleanArgs).slice(0, 1500),
        payload: name === "write_page"
            ? {
                painted: Boolean(result.payload?.painted),
                restamped: Boolean(result.payload?.restamped),
            }
            : name === "review_pages"
                ? {
                    ok: result.ok,
                    issues: result.payload?.issues ?? [],
                }
                : undefined,
    });
    return result;
}
export const HANDS_LOG_REL = path.join("_agent", "hands-log.jsonl");
export function skillStackFromHandsLog(root) {
    const file = path.join(root, HANDS_LOG_REL);
    if (!fs.existsSync(file))
        return skillStackEvidence([]);
    const timed = [];
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        if (!line.trim())
            continue;
        try {
            const row = JSON.parse(line);
            if (!row.name)
                continue;
            if (row.ok === false)
                continue;
            timed.push({ event: `tool:${row.name}` });
        }
        catch {
            /* skip a broken line */
        }
    }
    return skillStackEvidence(timed);
}
function diskPageCount(root) {
    const pages = path.join(root, "pages");
    if (!fs.existsSync(pages))
        return 0;
    return fs.readdirSync(pages).filter((name) => name.endsWith(".page")).length;
}
function diskRasterCount(root) {
    const dir = path.join(root, "_agent", "rasters");
    if (!fs.existsSync(dir))
        return 0;
    return fs.readdirSync(dir).filter((name) => name.endsWith(".png")).length;
}
export function mergeSkillStackEvidence(timed, root, extra) {
    const fromEvents = skillStackEvidence(timed);
    const fromHands = root ? skillStackFromHandsLog(root) : skillStackEvidence([]);
    const pageWrites = Math.max(fromEvents.pageWrites, fromHands.pageWrites, root ? diskPageCount(root) : 0);
    const renderPages = Math.max(fromEvents.renderPages, fromHands.renderPages, root ? diskRasterCount(root) : 0);
    const outline = fromEvents.outline ||
        fromHands.outline ||
        Boolean(root && fs.existsSync(path.join(root, "_agent", "outline.json")));
    const visualOrReview = fromEvents.visualOrReview ||
        fromHands.visualOrReview ||
        Boolean(root && diskRasterCount(root) > 0);
    const review = fromEvents.review || fromHands.review;
    const compose = fromEvents.compose || fromHands.compose || Boolean(extra?.compose);
    const oneShotDump = fromEvents.oneShotDump && fromHands.pageWrites === 0;
    const uniquePages = root ? diskPageCount(root) : 0;
    const uniqueRasters = root ? diskRasterCount(root) : 0;
    const renderCoverage = uniquePages >= 2
        ? uniqueRasters >= uniquePages
        : pageWrites >= 2 && renderPages >= pageWrites;
    const ok = outline && pageWrites >= 2 && visualOrReview && review && compose && !oneShotDump;
    return {
        ok,
        outline,
        pageWrites,
        renderPages,
        renderCoverage,
        visualOrReview,
        review,
        compose,
        oneShotDump,
        reason: ok
            ? extra?.compose && !fromEvents.compose
                ? "OpenKimi stack ran as agent tools; host composed after agent_end"
                : "OpenKimi stack ran as agent tools"
            : skillStackEvidence(timed).reason,
    };
}
function appendHandsLog(root, row) {
    fs.mkdirSync(path.join(root, "_agent"), { recursive: true });
    fs.appendFileSync(path.join(root, HANDS_LOG_REL), `${JSON.stringify(row)}\n`, "utf8");
}
/** `--skill` flags vs produce tools that actually executed. */
export function skillsExecutionMode(timed) {
    const ran = timed.some((e) => /^(tool:think|tool:list_references|tool:read_reference|tool:write_todo|tool:write_page|tool:render_page|tool:review_page|tool:review_pages|tool:compose_deck)/.test(e.event));
    return ran ? "agent-tools" : "flags-only";
}
export function skillStackEvidence(timed) {
    const names = timed.map((e) => e.event);
    const outline = names.some((e) => e === "tool:write_todo" || e.startsWith("tool:write_todo:"));
    const pageWrites = names.filter((e) => e === "tool:write_page" || e.startsWith("tool:write_page:")).length;
    const renderPages = names.filter((e) => e === "tool:render_page" || e.startsWith("tool:render_page:")).length;
    const renderCoverage = pageWrites >= 2 && renderPages >= pageWrites;
    const visualOrReview = names.some((e) => e === "tool:render_page" ||
        e.startsWith("tool:render_page:") ||
        e === "tool:review_pages" ||
        e.startsWith("tool:review_pages:"));
    const review = names.some((e) => e === "tool:review_pages" || e.startsWith("tool:review_pages:"));
    const compose = names.some((e) => e === "tool:compose_deck" || e.startsWith("tool:compose_deck:"));
    const oneShotDump = names.some((e) => e === "tool:write:skill-deck.json") && pageWrites === 0 && !outline;
    const ok = outline && pageWrites >= 2 && visualOrReview && review && compose && !oneShotDump;
    const missing = [];
    if (!outline)
        missing.push("write_todo");
    if (pageWrites < 2)
        missing.push(`write_page×${pageWrites} (need ≥2)`);
    if (!visualOrReview)
        missing.push("render_page|review_pages");
    if (!review)
        missing.push("review_pages");
    if (!compose)
        missing.push("compose_deck");
    if (oneShotDump)
        missing.push("one-shot skill-deck.json dump");
    return {
        ok,
        outline,
        pageWrites,
        renderPages,
        renderCoverage,
        visualOrReview,
        review,
        compose,
        oneShotDump,
        reason: ok
            ? "OpenKimi stack ran as agent tools"
            : `skills did not run as agent tools: ${missing.join(", ")}`,
    };
}
//# sourceMappingURL=domain-hands.js.map