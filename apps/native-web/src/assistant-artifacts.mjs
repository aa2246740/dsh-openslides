import fs from "node:fs";
import path from "node:path";

/** Version history owns artifacts; the conversation only projects their relation.
 * Old snapshots predate request IDs. Recover only an unambiguous next edit from
 * the saved conversation prefix AND the matching native authorization fact.
 * No model prose, version-label parsing or wall-clock proximity guesses.
 */
export function assistantVersionArtifacts(root, versions, conversation) {
  const messages = conversation?.messages || [];
  const candidates = [];
  let facts;
  for (const version of versions) {
    if (version.assistantRequestId) {
      // This is a before-version link, not a claim that the edit succeeded.
      // Its durable request identity is valid during a turn and after reload.
      const message = messages.find(item => item.clientRequestId === version.assistantRequestId);
      if (message) candidates.push({ messageId: message.id, snapshotId: version.id, snapshotLabel: version.id.toUpperCase() });
      continue;
    }
    const authorizationId = /^agent-chat:(agent-chat-[a-f0-9-]{36}):/.exec(version.note || "")?.[1];
    if (!authorizationId || !/^v[1-9]\d*$/.test(version.id)) continue;
    try {
      facts ??= JSON.parse(fs.readFileSync(path.join(root, "_agent/run-ledger.v1.json"), "utf8")).facts || [];
      const saved = JSON.parse(fs.readFileSync(path.join(root, ".versions", version.id, "_agent/assistant-conversation.v1.json"), "utf8")).messages;
      if (!Array.isArray(saved) || !saved.every((item, index) => item.id === messages[index]?.id)) continue;
      const message = messages[saved.length];
      if (message?.mode !== "edit") continue;
      const authorized = facts.filter(fact => fact.type === "page.edit-authorized" && fact.authorizationId === authorizationId);
      if (!authorized.length || authorized.some(fact => fact.at < version.createdAt || fact.at > message.at)) continue;
      // Another snapshot between preparation and acceptance makes the legacy
      // relation ambiguous (for example an abandoned send followed by a retry).
      if (versions.some(other => other.id !== version.id && other.createdAt >= version.createdAt && other.createdAt <= message.at)) continue;
      candidates.push({ messageId: message.id, snapshotId: version.id, snapshotLabel: version.id.toUpperCase() });
    } catch { /* Missing legacy provenance: leave the snapshot in version history. */ }
  }
  return candidates.filter(item => candidates.filter(other => other.messageId === item.messageId).length === 1);
}
