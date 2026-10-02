import { z } from "zod";

export const AgentReferenceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().optional(),
  text: z.string().optional(),
  sizeBytes: z.number().nonnegative().optional(),
  dataUrl: z.string().optional(),
  kind: z.enum(["file", "image"]).optional(),
});

export const AgentPinSchema = z.object({
  id: z.string().min(1),
  slideId: z.string().min(1),
  x: z.number(),
  y: z.number(),
  text: z.string(),
});

export const AgentRunInputSchema = z
  .object({
    prompt: z.string().optional(),
    title: z.string().optional(),
    templateId: z.string().optional(),
    modelId: z.string().optional(),
    references: z.array(AgentReferenceSchema).optional(),
    baseDeck: z.unknown().optional(),
    baseVersionId: z.string().optional(),
    baseVersionNumber: z.number().int().positive().optional(),
    designContract: z.string().optional(),
    mockSpeed: z.number().nonnegative().optional(),
    requestId: z.string().optional(),
    pins: z.array(AgentPinSchema).optional(),
  })
  .superRefine((val, ctx) => {
    const hasPins = (val.pins?.length ?? 0) > 0;
    const prompt = (val.prompt ?? "").trim();
    if (!prompt && !hasPins) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "prompt is required",
        path: ["prompt"],
      });
    }
  });

export type AgentRunInputParsed = z.infer<typeof AgentRunInputSchema>;
