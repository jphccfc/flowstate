type ChatMessage = { role: "system" | "user"; content: string };

type AIProviderName = "openai" | "litellm";

export type ChatCompletionRequest = {
  system: string;
  user: string;
  maxTokens: number;
};

type AIConfig = {
  provider: AIProviderName;
  baseUrl: string;
  apiKey: string;
  model: string;
};

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/(?:v1)\/?$/, "").replace(/\/$/, "");
}

function getProvider(): AIProviderName {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (!provider || provider === "openai") return "openai";
  if (provider === "litellm") return "litellm";
  throw new Error(`Unsupported AI provider: ${provider}`);
}

export function getAIGatewayConfig(): AIConfig {
  const provider = getProvider();

  if (provider === "litellm") {
    const baseUrl = process.env.LITELLM_BASE_URL ? normalizeBaseUrl(process.env.LITELLM_BASE_URL) : "";
    const apiKey = process.env.LITELLM_API_KEY?.trim() ?? "";
    const model = process.env.AI_MODEL?.trim() ?? "";
    if (!baseUrl || !apiKey || !model) throw new Error("AI gateway is not configured");
    return { provider, baseUrl, apiKey, model };
  }

  const baseUrl = normalizeBaseUrl(process.env.OPENAI_BASE_URL || "https://api.openai.com");
  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  const model = (process.env.OPENAI_MODEL || process.env.AI_MODEL)?.trim() || "gpt-4o-mini";
  if (!apiKey) throw new Error("OpenAI API key is not configured");
  return { provider, baseUrl, apiKey, model };
}

export async function requestChatCompletion({ system, user, maxTokens }: ChatCompletionRequest): Promise<string> {
  const { baseUrl, apiKey, model } = getAIGatewayConfig();
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ] satisfies ChatMessage[],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.error?.message === "string" ? data.error.message : `AI gateway request failed (${response.status})`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("AI gateway returned no text");
  return content;
}
