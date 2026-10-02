import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { UserQuestionError } from "@deepseek-ai/dsh-user-questions";
const FILE = "assistant-questions.v1.json";
/** Native DSH waterfall adapter for the product's single conversation surface.
 * Only JSON presentation data is persisted; live agents/signals never cross HTTP.
 */
export class AssistantQuestions {
    rootFor;
    pending = new Map();
    constructor(rootFor) {
        this.rootFor = rootFor;
    }
    file(sessionId) {
        const root = this.rootFor(sessionId);
        if (!root)
            throw new Error("Unknown slide session");
        return path.join(root, "_agent", FILE);
    }
    list(sessionId) {
        const file = this.file(sessionId);
        if (!fs.existsSync(file))
            return [];
        const rows = JSON.parse(fs.readFileSync(file, "utf8"));
        return rows.map(row => row.status === "pending" && !this.pending.has(row.id) ? { ...row, status: "interrupted" } : row);
    }
    write(sessionId, rows) {
        const file = this.file(sessionId);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const temp = `${file}.${crypto.randomUUID()}.tmp`;
        fs.writeFileSync(temp, JSON.stringify(rows, null, 2));
        fs.renameSync(temp, file);
    }
    ask(sessionId, request) {
        if (request.signal?.aborted)
            return Promise.reject(new UserQuestionError("Question aborted", "ASK_ABORTED"));
        const row = { id: crypto.randomUUID(), at: new Date().toISOString(), questions: structuredClone(request.questions), status: "pending" };
        return new Promise((resolve, reject) => {
            const onAbort = () => finish(undefined, new UserQuestionError("Question aborted", "ASK_ABORTED"), true);
            const finish = (answer, error, force = false) => {
                if (!this.pending.has(row.id))
                    return;
                try {
                    this.write(sessionId, this.list(sessionId).map(item => item.id === row.id ? { ...item, status: answer ? "answered" : "cancelled", ...(answer ? { answer, answeredAt: new Date().toISOString() } : {}) } : item));
                }
                catch (failure) {
                    // HTTP must not acknowledge an answer that was not durably saved.
                    // Keep the native tool waiting so the same answer can be retried.
                    if (!force)
                        throw failure;
                    error = failure instanceof Error ? failure : new Error(String(failure));
                }
                this.pending.delete(row.id);
                request.signal?.removeEventListener("abort", onAbort);
                if (error)
                    reject(error);
                else if (answer)
                    resolve(answer);
            };
            this.pending.set(row.id, { sessionId, finish });
            try {
                this.write(sessionId, [...this.list(sessionId), row]);
            }
            catch (error) {
                this.pending.delete(row.id);
                reject(error);
                return;
            }
            request.signal?.addEventListener("abort", onAbort, { once: true });
            if (request.signal?.aborted)
                onAbort();
        });
    }
    settle(sessionId, id, body) {
        const row = this.list(sessionId).find(item => item.id === id);
        if (!row)
            throw new Error("这个问题已不存在，请刷新对话。");
        const answer = body.action === "answer" ? validateAnswer(row.questions, body.answer) : undefined;
        if (!answer && body.action !== "cancel")
            throw new Error("无效的回答操作");
        // A lost HTTP acknowledgement may be retried, but never changed after settlement.
        if (row.status === "answered" && JSON.stringify(row.answer) === JSON.stringify(answer))
            return;
        if (row.status === "cancelled" && body.action === "cancel")
            return;
        const pending = this.pending.get(id);
        if (row.status !== "pending" || pending?.sessionId !== sessionId)
            throw new Error("这个问题已结束，请查看最新对话。");
        pending.finish(answer, answer ? undefined : new UserQuestionError("The user cancelled this question; do not infer a choice or proceed with dependent changes.", "ASK_CANCELLED"));
    }
    dispose() {
        for (const item of [...this.pending.values()])
            item.finish(undefined, new UserQuestionError("Question connection closed", "ASK_ABORTED"), true);
    }
}
export function validateAnswer(questions, value) {
    if (!value || typeof value !== "object" || !("answers" in value) || !Array.isArray(value.answers) || value.answers.length !== questions.length)
        throw new Error("请回答所有问题后再继续。");
    const received = value.answers;
    const seen = new Set();
    const answers = questions.map(question => {
        const item = received.find((item) => item && typeof item === "object" && "id" in item && item.id === question.id);
        if (!item || seen.has(question.id) || !Array.isArray(item.selected) || item.selected.some(label => typeof label !== "string"))
            throw new Error("回答与当前问题不匹配。");
        seen.add(question.id);
        const selected = item.selected;
        if (new Set(selected).size !== selected.length || selected.some(label => !question.options?.some(option => option.label === label)))
            throw new Error("请选择当前问题提供的选项。");
        const custom = typeof item.custom === "string" ? item.custom.trim() : "";
        if (custom.length > 8000 || (!selected.length && !custom) || (!question.multiSelect && (selected.length > 1 || (selected.length && custom))))
            throw new Error("请提供一个有效回答。");
        return { id: question.id, selected, ...(custom ? { custom } : {}) };
    });
    return { answers };
}
//# sourceMappingURL=assistant-questions.js.map