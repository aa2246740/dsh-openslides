import crypto from "node:crypto";

const SECRET_KEY = /(?:api.?key|access.?token|refresh.?token|authorization|cookie|credential|password|secret)/i;

export function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function redactValue(value, key = "", seen = new WeakSet()) {
  if (key && SECRET_KEY.test(key)) return "[redacted]";
  if (typeof value === "string") {
    return value
      .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
      .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/g, "[redacted]");
  }
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, "", seen));
  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [childKey, redactValue(child, childKey, seen)]),
  );
}

function summarizeContent(content) {
  if (typeof content === "string") {
    return { kind: "text", chars: content.length, sha256: sha256(content) };
  }
  if (!Array.isArray(content)) return redactValue(content);
  return content.map((part) => {
    if (!part || typeof part !== "object") return redactValue(part);
    const type = typeof part.type === "string" ? part.type : "unknown";
    const text = typeof part.text === "string" ? part.text : undefined;
    return {
      type,
      ...(text === undefined ? {} : { chars: text.length, sha256: sha256(text) }),
      ...(type.includes("image") ? { image: "[omitted]" } : {}),
    };
  });
}

/** Keep the provider JSON shape and complete tool schemas, but replace prose and secrets. */
export function sanitizeWireRequest(body) {
  const clean = redactValue(body);
  if (!clean || typeof clean !== "object" || Array.isArray(clean)) return clean;
  if (Array.isArray(clean.messages)) {
    clean.messages = clean.messages.map((message) => ({
      ...message,
      ...(Object.hasOwn(message, "content") ? { content: summarizeContent(message.content) } : {}),
    }));
  }
  if (typeof clean.instructions === "string") {
    clean.instructions = summarizeContent(clean.instructions);
  }
  if (typeof clean.input === "string") clean.input = summarizeContent(clean.input);
  return clean;
}

function collectArgumentFragments(value, path, into) {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectArgumentFragments(item, `${path}[${index}]`, into));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if ((key === "arguments" || key === "partial_json") && typeof child === "string") {
      into.push({ path: childPath, dialect: key === "partial_json" ? "anthropic" : "openai", fragment: redactValue(child) });
    }
    collectArgumentFragments(child, childPath, into);
  }
}

function collectRoleFields(value, path, into) {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectRoleFields(item, `${path}[${index}]`, into));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (key === "role" && typeof child === "string") into.push({ path: childPath, value: child });
    collectRoleFields(child, childPath, into);
  }
}

function safeEventShape(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valueType: Array.isArray(value) ? "array" : value === null ? "null" : typeof value };
  }
  const choices = Array.isArray(value.choices)
    ? value.choices.map((choice) => ({
        keys: choice && typeof choice === "object" ? Object.keys(choice) : [],
        finishReason: choice?.finish_reason == null ? undefined : String(choice.finish_reason),
        deltaKeys: choice?.delta && typeof choice.delta === "object" ? Object.keys(choice.delta) : [],
        deltaRole: typeof choice?.delta?.role === "string" ? choice.delta.role : undefined,
        messageKeys: choice?.message && typeof choice.message === "object" ? Object.keys(choice.message) : [],
        messageRole: typeof choice?.message?.role === "string" ? choice.message.role : undefined,
      }))
    : undefined;
  return {
    topLevelKeys: Object.keys(value),
    ...(typeof value.type === "string" ? { type: value.type } : {}),
    ...(choices === undefined ? {} : { choices }),
    ...(value.error && typeof value.error === "object"
      ? { errorKeys: Object.keys(value.error) }
      : {}),
  };
}

/** Extract exact provider SSE/JSON function.arguments fragments without retaining prose. */
export function extractWireToolEvidence(rawText) {
  const fragments = [];
  const finishReasons = [];
  const roles = [];
  const errors = [];
  const eventShapeCounts = new Map();
  for (const line of rawText.split(/\r?\n/)) {
    const payload = line.startsWith("data:") ? line.slice(5).trim() : line.trim();
    if (!payload || payload === "[DONE]") continue;
    let value;
    try {
      value = JSON.parse(payload);
    } catch {
      continue;
    }
    collectArgumentFragments(value, "", fragments);
    collectRoleFields(value, "", roles);
    const shape = safeEventShape(value);
    const shapeKey = JSON.stringify(shape);
    eventShapeCounts.set(shapeKey, (eventShapeCounts.get(shapeKey) ?? 0) + 1);
    if (value?.error && typeof value.error === "object") {
      errors.push({
        keys: Object.keys(value.error),
        ...(typeof value.error.type === "string" ? { type: value.error.type } : {}),
        ...(typeof value.error.code === "string" ? { code: value.error.code } : {}),
        ...(typeof value.error.message === "string"
          ? { message: redactValue(value.error.message).slice(0, 500) }
          : {}),
      });
    }
    const choices = Array.isArray(value?.choices) ? value.choices : [];
    for (const choice of choices) {
      if (choice?.finish_reason != null) finishReasons.push(String(choice.finish_reason));
    }
    if (value?.delta?.stop_reason != null) finishReasons.push(String(value.delta.stop_reason));
    if (value?.stop_reason != null) finishReasons.push(String(value.stop_reason));
    if (value?.status === "completed" || value?.status === "failed") {
      finishReasons.push(String(value.status));
    }
  }
  const byPath = new Map();
  for (const row of fragments) byPath.set(row.path, `${byPath.get(row.path) ?? ""}${row.fragment}`);
  const assembledArguments = [...byPath].map(([path, raw]) => ({
    path,
    raw,
    classification: classifyToolArguments(raw),
  }));
  const roleMap = new Map(roles.map((row) => [`${row.path}\0${row.value}`, row]));
  return {
    fragments,
    assembledArguments,
    finishReasons: [...new Set(finishReasons)],
    roles: [...roleMap.values()],
    eventShapes: [...eventShapeCounts].map(([serialized, count]) => ({
      ...JSON.parse(serialized),
      count,
    })),
    errors,
  };
}

export function classifyToolArguments(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "invalid-json", envelopeDepth: null, hasBusinessArgs: false };
  }
  let cursor = parsed;
  let envelopeDepth = 0;
  while (
    cursor &&
    typeof cursor === "object" &&
    !Array.isArray(cursor) &&
    Object.keys(cursor).length === 1 &&
    cursor.arguments &&
    typeof cursor.arguments === "object" &&
    !Array.isArray(cursor.arguments)
  ) {
    cursor = cursor.arguments;
    envelopeDepth += 1;
  }
  const hasBusinessArgs = Boolean(
    cursor && typeof cursor === "object" && !Array.isArray(cursor) &&
    typeof cursor.id === "string" && Array.isArray(cursor.elements),
  );
  return {
    kind: !hasBusinessArgs ? "schema-mismatch" : envelopeDepth === 0 ? "exact" : `arguments-envelope-${envelopeDepth}`,
    envelopeDepth,
    hasBusinessArgs,
    topLevelKeys: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? Object.keys(parsed) : [],
    businessKeys: cursor && typeof cursor === "object" && !Array.isArray(cursor) ? Object.keys(cursor) : [],
  };
}
