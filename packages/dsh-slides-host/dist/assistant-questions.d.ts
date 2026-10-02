import { type AskUserQuestionAnswer, type AskUserQuestionItem, type AskUserQuestionRequest } from "@deepseek-ai/dsh-user-questions";
export type AssistantQuestion = {
    id: string;
    at: string;
    questions: AskUserQuestionItem[];
    status: "pending" | "answered" | "cancelled" | "interrupted";
    answer?: AskUserQuestionAnswer;
    answeredAt?: string;
};
/** Native DSH waterfall adapter for the product's single conversation surface.
 * Only JSON presentation data is persisted; live agents/signals never cross HTTP.
 */
export declare class AssistantQuestions {
    private rootFor;
    private pending;
    constructor(rootFor: (sessionId: string) => string | undefined);
    private file;
    list(sessionId: string): AssistantQuestion[];
    private write;
    ask(sessionId: string, request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer>;
    settle(sessionId: string, id: string, body: {
        action?: unknown;
        answer?: unknown;
    }): void;
    dispose(): void;
}
export declare function validateAnswer(questions: AskUserQuestionItem[], value: unknown): AskUserQuestionAnswer;
//# sourceMappingURL=assistant-questions.d.ts.map