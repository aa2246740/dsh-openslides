import { type GenerateOptions, type StreamChunk } from "@deepseek-ai/dsh-llm";
import { type AssistantMode } from "./assistant-conversation.js";
import type { ModelSelectionInput } from "./session-transition.js";
export type AssistantIntent = {
    intent: AssistantMode;
    scope: "current" | "selection" | "pages" | "deck";
    pages: number[];
    /** Page-list mutation authorization: existing pages must stay byte-identical. */
    structureOnly?: boolean;
    /** 0-based insertion position for new pages (0 = before page 1, pageCount = append). */
    insertIndex?: number;
    /**
     * 1-based numbers of baseline pages a structural turn may also modify
     * ("加一页并把第2页标题改大" → editablePages [2]). Only valid with
     * structureOnly; every listed page still requires a read-then-CAS write.
     */
    editablePages?: number[];
    /** Exact number of pages the user asked to add ("加3页" → 3); omit = at least one. */
    addCount?: number;
    /**
     * 1-based numbers of baseline pages the user asked to remove
     * ("删掉第3页" / "把第2、3页合并" → the absorbed pages). Only valid with
     * structureOnly; never overlaps editablePages.
     */
    deletablePages?: number[];
    /**
     * Desired final page order as a permutation of 1..pageCount ("把第3页挪到
     * 最前面" → [3,1,2,…]). Pure manifest order change — never combined with
     * insertIndex/addCount/deletablePages in the same turn.
     */
    reorderTo?: number[];
    /**
     * Full-deck rewrite ("完全重做"/"推翻重新生成"): the new committed plan
     * replaces the entire page list. Never combined with structureOnly or a
     * page scope; the client always asks for explicit confirmation first.
     */
    rewrite?: boolean;
    /**
     * Deck-level metadata fields this turn may update: "把文稿标题改成X" →
     * ["title"], "整套配色换深色" → ["theme"]. Attachable to any scope; a
     * rewrite already covers both so the field is dropped there.
     */
    editableMeta?: ("title" | "theme")[];
};
export type AssistantIntentInput = {
    text: string;
    pageCount: number;
    currentPage: number;
    selectedCount: number;
    /**
     * Ordered page inventory ({id, title, position}) so semantic references like
     * "在封面后面加一页" resolve to an insertIndex instead of a guess.
     */
    pages?: readonly {
        id: string;
        title: string;
        position: number;
    }[];
    history: {
        role: "user" | "assistant";
        text: string;
        at: string;
    }[];
    sessionId?: string;
    modelSelection?: ModelSelectionInput;
};
/** A narrow explicit read-only guard; semantic routing remains model-owned. */
export declare function explicitlyReadOnly(text: string): boolean;
export declare function parseAssistantIntent(raw: string, input: Pick<AssistantIntentInput, "text" | "pageCount" | "selectedCount" | "history">): AssistantIntent;
/** Only public user/assistant text is used; tool logs and private reasoning are excluded. */
export declare function assistantIntentHistory(root: string): AssistantIntentInput["history"];
export declare function inferAssistantIntent(stream: (options: GenerateOptions) => AsyncIterable<StreamChunk>, route: Pick<GenerateOptions, "provider" | "model" | "reasoningEffort">, input: AssistantIntentInput): Promise<AssistantIntent>;
//# sourceMappingURL=assistant-intent.d.ts.map