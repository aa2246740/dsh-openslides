/**
 * Image → editable nodes via a multimodal LLM (AC-11), DSH path.
 *
 * Migrated from agent-harness (freeze fixture): the sidecar only needs the
 * single image-reading call, not the full retrying LlmPort. The chat model
 * is the only vision capability; backends that cannot read images throw and
 * callers fall back to the prompt-label path.
 */
import fs from "node:fs";
import path from "node:path";
const SCHEMA = {
    title: "string, optional",
    nodes: [
        {
            text: "string, short node label",
            role: "title|node|caption, optional",
        },
    ],
};
export function imageToDataUrl(file) {
    const buf = fs.readFileSync(file);
    const ext = path.extname(file).toLowerCase();
    const mime = ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".gif"
            ? "image/gif"
            : ext === ".webp"
                ? "image/webp"
                : "image/png";
    return `data:${mime};base64,${buf.toString("base64")}`;
}
function chatCompletionsUrl(baseUrl) {
    const u = baseUrl.trim().replace(/\/+$/, "");
    if (/\/chat\/completions$/i.test(u))
        return u;
    if (u.endsWith("/v1") || /\/openai$/i.test(u))
        return `${u}/chat/completions`;
    return `${u}/v1/chat/completions`;
}
function parseNodes(raw) {
    if (!raw || typeof raw !== "object")
        return [];
    const nodes = raw.nodes;
    if (!Array.isArray(nodes))
        return [];
    return nodes
        .map((n) => {
        if (!n || typeof n !== "object")
            return null;
        const text = String(n.text ?? "").trim();
        if (!text)
            return null;
        const role = n.role;
        return {
            text,
            role: role === "title" || role === "caption" ? role : "node",
        };
    })
        .filter((n) => Boolean(n))
        .slice(0, 12);
}
async function completeJsonWithImages(config, system, user, images) {
    if (config.image === false)
        throw new Error("LLM backend is text-only (image disabled)");
    const parts = [
        { type: "text", text: user },
        ...images.map((img) => ({ type: "image_url", image_url: { url: img.url } })),
    ];
    const payload = {
        model: config.model,
        temperature: 0.3,
        messages: [
            { role: "system", content: system },
            { role: "user", content: parts },
        ],
        response_format: { type: "json_object" },
    };
    const headers = { "content-type": "application/json" };
    if (config.apiKey)
        headers.authorization = `Bearer ${config.apiKey}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), config.timeoutMs ?? 120_000);
    try {
        const res = await fetch(chatCompletionsUrl(config.baseUrl), {
            method: "POST",
            headers,
            signal: ac.signal,
            body: JSON.stringify(payload),
        });
        const body = await res.text();
        if (!res.ok)
            throw new Error(`LLM HTTP ${res.status}: ${body.slice(0, 300)}`);
        const message = JSON.parse(body)
            .choices?.[0]?.message;
        const content = typeof message?.content === "string" ? message.content : "";
        if (!content.trim())
            throw new Error("LLM returned empty content");
        const fence = content.trim().match(/```(?:json)?\s*([\s\S]*?)```/);
        return JSON.parse(fence ? fence[1].trim() : content.trim());
    }
    finally {
        clearTimeout(timer);
    }
}
/**
 * Read an image into structured nodes. Throws when the backend cannot
 * read images or returns no nodes — the caller falls back.
 */
export async function rebuildNodesFromImage(config, imagePath, hint) {
    const dataUrl = imageToDataUrl(imagePath);
    const system = [
        "You read a slide image and return its editable structure as JSON only.",
        "Extract visible text and the diagram structure. Do not invent content.",
        "Return short node labels in reading order; mark the top title if any.",
        "Schema:",
        JSON.stringify(SCHEMA),
    ].join("\n");
    const user = hint
        ? `Image attached. Optional user hint: ${hint}. Return the JSON object now.`
        : "Image attached. Return the JSON object now.";
    const raw = await completeJsonWithImages(config, system, user, [{ url: dataUrl }]);
    const nodes = parseNodes(raw);
    if (!nodes.length)
        throw new Error("LLM returned no nodes for image");
    return nodes;
}
//# sourceMappingURL=image-rebuild.js.map