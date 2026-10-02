import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
export const MAX_ATTACHMENT_CONTEXT_CHARS = 48_000;
export const inputSha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const isHash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export function generationFormat(kind, layout) {
    if (kind !== undefined && kind !== "Slides")
        throw new Error("kind must be Slides; Docs and Report are not supported");
    if (layout !== undefined && layout !== "16:9" && layout !== "4:3")
        throw new Error("layout must be 16:9 or 4:3; Adaptive is not supported");
    return { kind: "Slides", layout: layout ?? "16:9", size: layout === "4:3" ? [720, 540] : [960, 540] };
}
export function verifiedAttachment(id, body) {
    if (body.id !== id || body.parsed !== true || body.complete !== true || body.clipped === true
        || body.truncated === true || body.ownerId !== undefined || typeof body.text !== "string" || !body.text.trim()
        || typeof body.name !== "string" || !body.name.trim() || !isHash(body.storeId)
        || !isHash(body.originalSha256) || !isHash(body.textSha256) || body.textSha256 !== inputSha256(body.text)
        || body.parser !== "utf8-full-v1" || !Number.isSafeInteger(body.bytes) || Number(body.bytes) <= 0
        || body.chars !== body.text.length) {
        throw new Error(`attachment ${id} lacks a complete, owned and hash-verified parsing receipt; re-upload it`);
    }
    return {
        id, name: body.name, text: body.text, bytes: Number(body.bytes), chars: body.text.length,
        storeId: body.storeId, originalSha256: body.originalSha256, textSha256: body.textSha256,
        parser: body.parser, parsed: true, complete: true,
    };
}
export function attachmentDeliveryBlock(attachment) {
    return JSON.stringify({ id: attachment.id, name: attachment.name, text: attachment.text });
}
export function assertAttachmentBudget(attachments) {
    if (attachments.reduce((sum, attachment) => sum + attachmentDeliveryBlock(attachment).length, 0) > MAX_ATTACHMENT_CONTEXT_CHARS) {
        throw new Error(`selected attachment JSON context exceeds ${MAX_ATTACHMENT_CONTEXT_CHARS} characters; explicitly remove files or use separate turns, no text was clipped`);
    }
}
export function persistGenerationInput(projectRoot, input) {
    const expectedFormat = generationFormat(input.format.kind, input.format.layout);
    if (JSON.stringify(input.format.size) !== JSON.stringify(expectedFormat.size)
        || input.initialMessageSha256 !== inputSha256(input.initialMessage)
        || !input.initialMessage.includes(input.brief))
        throw new Error("generation input does not match its actual initial message or canvas");
    assertAttachmentBudget(input.attachments);
    const ids = new Set();
    for (const attachment of input.attachments) {
        verifiedAttachment(attachment.id, { ...attachment });
        const block = attachmentDeliveryBlock(attachment);
        if (ids.has(attachment.id) || attachment.contentBlockSha256 !== inputSha256(block) || !input.initialMessage.includes(block)) {
            throw new Error("generation input does not include each selected attachment exactly as delivered");
        }
        ids.add(attachment.id);
    }
    const serialized = JSON.stringify(input);
    const fingerprint = inputSha256(serialized);
    const destination = path.join(projectRoot, "_agent", "generation-input.v1.json");
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, `${JSON.stringify({ ...input, fingerprint }, null, 2)}\n`, { flag: "wx" });
    return fingerprint;
}
//# sourceMappingURL=generation-input.js.map