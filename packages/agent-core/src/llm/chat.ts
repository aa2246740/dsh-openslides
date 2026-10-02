import type { LlmCredentials } from "./credentials.js";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatCompletionOptions = {
  credentials: LlmCredentials;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Force JSON object response when supported */
  jsonMode?: boolean;
};

export type ChatCompletionResult = {
  content: string;
  model: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export async function chatCompletion(
  opts: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  const { credentials, messages, signal } = opts;
  const url = `${credentials.baseUrl}/chat/completions`;
  const body: Record<string, unknown> = {
    model: credentials.model,
    messages,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens ?? 8192,
  };
  if (opts.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credentials.apiKey}`,
      "Content-Type": "application/json",
      ...credentials.headers,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `LLM HTTP ${res.status}: ${text.slice(0, 400) || res.statusText}`,
    );
  }

  const data = (await res.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: ChatCompletionResult["usage"];
  };
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) {
    throw new Error("LLM returned empty content");
  }
  return {
    content,
    model: data.model ?? credentials.model,
    usage: data.usage,
  };
}

/** Extract first JSON object from model text (fenced or raw). */
export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error("Could not parse JSON object from model output");
  }
}
