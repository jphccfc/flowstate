import { afterEach, describe, expect, it, vi } from "vitest";
import { requestChatCompletion } from "../../lib/ai/client";

describe("AI gateway client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("sends chat requests through LiteLLM using configured model and bearer auth", async () => {
    vi.stubEnv("LITELLM_BASE_URL", "http://litellm.test:4000");
    vi.stubEnv("LITELLM_API_KEY", "gateway-test-key");
    vi.stubEnv("AI_MODEL", "flowstate-test-model");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "[{\"targetId\":\"cap-1\",\"confidence\":0.91}]" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const result = await requestChatCompletion({
      system: "Return JSON only.",
      user: "Tag this evidence.",
      maxTokens: 256,
    });

    expect(result).toBe("[{\"targetId\":\"cap-1\",\"confidence\":0.91}]");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://litellm.test:4000/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer gateway-test-key",
        },
        body: JSON.stringify({
          model: "flowstate-test-model",
          max_tokens: 256,
          messages: [
            { role: "system", content: "Return JSON only." },
            { role: "user", content: "Tag this evidence." },
          ],
        }),
      })
    );
  });

  it("fails clearly when the gateway is not configured", async () => {
    vi.stubEnv("LITELLM_BASE_URL", "");
    vi.stubEnv("LITELLM_API_KEY", "");

    await expect(
      requestChatCompletion({ system: "system", user: "user", maxTokens: 64 })
    ).rejects.toThrow("AI gateway is not configured");
  });
});
