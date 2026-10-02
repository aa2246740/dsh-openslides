export type AssistantMode = "discuss" | "edit" | "generate";
export type ConversationMessage = {
    id: string;
    at: string;
    text: string;
    mode: AssistantMode;
    reviewSubmissionId?: string;
    clientRequestId?: string;
};
export type Conversation = {
    version: 1;
    mode: AssistantMode;
    messages: ConversationMessage[];
};
export declare const DISCUSSION_TOOLS: ReadonlySet<string>;
export declare function readConversation(root: string): Conversation;
/** The disk policy survives a Host restart; a read failure must never enable writes. */
export declare function discussionOnly(root: string): boolean;
export declare function recordConversationMessage(root: string, text: string, mode: AssistantMode, reviewSubmissionId?: string, clientRequestId?: string): ConversationMessage;
export declare function discussionInstruction(text: string, context?: string): string;
/** A later user answer can complete the earlier creation request. */
export declare function generationInstruction(text: string): string;
//# sourceMappingURL=assistant-conversation.d.ts.map