import { t } from "./i18n.js";

export function conversationMessageKey(message) {
  return `user:${message.clientRequestId || message.id}`;
}

/** Only a persisted Host user message proves that a prepared batch was sent. */
export function acceptedReviewSubmissions(activity = {}) {
  const accepted = new Set((activity?.conversation?.messages || []).map(message => message.reviewSubmissionId).filter(Boolean));
  return (activity?.reviewSubmissions || []).filter(item => accepted.has(item.id))
    .map(item => ({ ...item, status: item.status === "preparing" ? "running" : item.status }));
}

export function commentIsDraft(comment, activity = {}) {
  if (comment.resolved || comment.aiStatus === "applied") return false;
  return !acceptedReviewSubmissions(activity).some(submission =>
    comment.aiSubmissionId === submission.id || submission.items.some(item =>
      item.commentId === comment.id && item.pagePath === comment.pagePath &&
      Number(comment.revision) <= Number(item.commentRevision) + 1));
}

/** User text is project metadata; model replies remain the DSH journal's truth. */
export function conversationEvents(activity = {}) {
  const events = [...(activity.events || [])];
  const submissions = acceptedReviewSubmissions(activity);
  const lastSubmissionByComment = new Map();
  for (const submission of submissions) for (const item of submission.items) {
    lastSubmissionByComment.set(item.pagePath + ":" + item.commentId, submission.id);
  }
  for (const [index, message] of (activity.conversation?.messages || []).entries()) {
    if (index === 0 && message.text === activity.brief) continue;
    if (!message.id || !message.text) continue;
    const submission = submissions.find(item => item.id === message.reviewSubmissionId);
    const reviewSubmission = submission && {
      ...submission,
      retryable: ["failed", "cancelled"].includes(submission.status) && submission.items.every(item =>
        lastSubmissionByComment.get(item.pagePath + ":" + item.commentId) === submission.id),
    };
    events.push({ id: conversationMessageKey(message), at: message.at, kind: "user", detail: message.text, status: "complete", label: t("你"), reviewSubmission });
  }
  return events.map((event, index) => ({ event, index })).sort((a, b) => {
    const delta = Date.parse(a.event.at) - Date.parse(b.event.at);
    return Number.isFinite(delta) && delta !== 0 ? delta : a.index - b.index;
  }).map(({ event }) => event);
}

/** A reply-only turn is idle even if an earlier generation ledger is unfinished. */
export function settledAssistantActivity(activity, agentStatus) {
  const mode = activity.conversation?.mode;
  if (!mode) return { ...activity, agentStatus };
  const latestUser = activity.conversation.messages?.at(-1);
  const after = (activity.events || []).filter(row => Date.parse(row.at) >= Date.parse(latestUser?.at));
  const end = [...after].reverse().find(row => row.kind === "turn" && row.name === "turn");
  const busy = agentStatus !== "idle";
  let phase = activity.phase;
  if (["discuss", "edit"].includes(mode)) phase = busy ? (mode === "discuss" ? "discussing" : "reviewing")
    : end?.status === "failed" ? "failed" : mode === "discuss" ? "discussion" : "edited";
  else if (!busy && end?.status === "complete" && !["complete", "failed"].includes(phase)) {
    if (after.some(row => row.kind === "message") && !after.some(row => row.kind === "tool")) phase = "discussion";
    else if (after.some(row => row.kind === "tool")) phase = "paused";
  }
  return { ...activity, agentStatus, phase, ...(["discuss", "edit"].includes(mode)
    ? { error: end?.status === "failed" ? { detail: end.detail } : undefined } : {}) };
}
