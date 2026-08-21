type ChatMessage = { role: "system" | "user"; content: string };

export type ChatCompletionRequest = {
  system: string;
  user: string;
  maxTokens: number;
};

export function getAIGatewayConfig() {
  const baseUrl = process.env.LITELLM_BASE_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.LITELLM_API_KEY?.trim();
  const model = process.env.AI_MODEL?.trim();
  if (!baseUrl || !apiKey || !model) {
    throw new Error("AI gateway is not configured");
  }
  return { baseUrl, apiKey, model };
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
