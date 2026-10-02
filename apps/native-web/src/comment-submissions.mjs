import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const FILE = "comment-submissions.v1.json";

// Native server is the sole writer; Host conversation messages are the durable
// acceptance receipt. Preparing batches are never presented as sent on their own.
export function readCommentSubmissions(root) {
  const file = path.join(root, "_agent", FILE);
  if (!fs.existsSync(file)) return [];
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  if (value.version !== 1 || !Array.isArray(value.submissions)) throw new Error("Invalid comment submission record");
  return value.submissions;
}

function write(root, submissions) {
  const file = path.join(root, "_agent", FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + "." + crypto.randomUUID() + ".tmp";
  fs.writeFileSync(temp, JSON.stringify({ version: 1, submissions }, null, 2));
  fs.renameSync(temp, file);
}

export function createCommentSubmission(root, prepared, brief) {
  const submission = {
    id: crypto.randomUUID(), at: new Date().toISOString(), status: "preparing",
    brief: String(brief || "").slice(0, 10000),
    items: prepared.map(({ pagePath, comment }) => ({
      pagePath, commentId: comment.id, commentRevision: comment.revision,
      text: comment.text, scope: comment.scope,
    })),
  };
  write(root, [...readCommentSubmissions(root), submission]);
  return submission;
}

export function finishCommentSubmission(root, id, status, error) {
  if (!id) return; // Older single-comment locks have no conversation receipt.
  write(root, readCommentSubmissions(root).map(item => item.id === id
    ? { ...item, status, error: String(error || "").slice(0, 2000) || undefined, finishedAt: new Date().toISOString() }
    : item));
}
