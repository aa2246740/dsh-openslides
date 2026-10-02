export declare const MAX_ATTACHMENT_CONTEXT_CHARS = 48000;
export declare const inputSha256: (value: string | Buffer) => string;
export type GenerationFormat = Readonly<{
    kind: "Slides";
    layout: "16:9" | "4:3";
    size: readonly [number, number];
}>;
export declare function generationFormat(kind: unknown, layout: unknown): GenerationFormat;
export type EditorAttachment = Readonly<{
    id: string;
    name: string;
    text: string;
    bytes: number;
    chars: number;
    storeId: string;
    originalSha256: string;
    textSha256: string;
    parser: string;
    parsed: true;
    complete: true;
}>;
export declare function verifiedAttachment(id: string, body: Record<string, unknown>): EditorAttachment;
export declare function attachmentDeliveryBlock(attachment: EditorAttachment): string;
export declare function assertAttachmentBudget(attachments: readonly EditorAttachment[]): void;
export type GenerationInputSnapshot = Readonly<{
    version: 1;
    sessionId: string;
    acceptedAt: string;
    brief: string;
    format: GenerationFormat;
    design: Readonly<{
        kind: "self-directed";
    }> | Readonly<{
        kind: "explicit-style";
        designSystemId: string;
        designSourceId: string;
        designHash: string;
    }>;
    model: Readonly<{
        provider: string;
        model: string;
        reasoningEffort?: string;
    }>;
    attachments: readonly (EditorAttachment & Readonly<{
        contentBlockSha256: string;
    }>)[];
    initialMessage: string;
    initialMessageSha256: string;
}>;
export declare function persistGenerationInput(projectRoot: string, input: GenerationInputSnapshot): string;
//# sourceMappingURL=generation-input.d.ts.map