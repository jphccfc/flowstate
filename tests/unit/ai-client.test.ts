import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestChatCompletion } from "../../lib/ai/client";

describe("OpenAI client", () => {
  beforeEach(() => {
    vi.stubEnv("AI_PROVIDER", "");
    vi.stubEnv("OPENAI_BASE_URL", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_MODEL", "");
    vi.stubEnv("AI_MODEL", "");
    vi.stubEnv("LITELLM_BASE_URL", "");
    vi.stubEnv("LITELLM_API_KEY", "");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("normalizes the default OpenAI base URL to the v1 chat path", async () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-test-key");
    vi.stubEnv("OPENAI_BASE_URL", "");
    vi.stubEnv("OPENAI_MODEL", "gpt-test-model");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 })
    );

    await requestChatCompletion({ system: "system", user: "user", maxTokens: 64 });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.anything()
    );
  });

  it("normalizes an OpenAI-compatible base URL that already includes v1", async () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-test-key");
    vi.stubEnv("OPENAI_BASE_URL", "http://openai.test:4000/v1/");
    vi.stubEnv("OPENAI_MODEL", "gpt-test-model");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 })
    );

    await requestChatCompletion({ system: "system", user: "user", maxTokens: 64 });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://openai.test:4000/v1/chat/completions",
      expect.anything()
    );
  });

  it("sends a direct OpenAI chat request with bearer auth and configured model", async () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-test-key");
    vi.stubEnv("OPENAI_BASE_URL", "");
    vi.stubEnv("OPENAI_MODEL", "gpt-test-model");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "answer" } }] }), { status: 200 })
    );

    const result = await requestChatCompletion({
      system: "Return JSON only.",
      user: "Tag this evidence.",
      maxTokens: 256,
    });

    expect(result).toBe("answer");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer openai-test-key",
        },
        body: JSON.stringify({
          model: "gpt-test-model",
          max_tokens: 256,
          messages: [
            { role: "system", content: "Return JSON only." },
            { role: "user", content: "Tag this evidence." },
          ],
        }),
      })
    );
  });

  it("uses AI_MODEL as a fallback when OPENAI_MODEL is not set", async () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-test-key");
    vi.stubEnv("AI_MODEL", "app-wide-test-model");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 })
    );

    await requestChatCompletion({ system: "system", user: "user", maxTokens: 64 });

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).model).toBe("app-wide-test-model");
  });

  it("fails clearly when the OpenAI API key is missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_MODEL", "gpt-test-model");

    await expect(
      requestChatCompletion({ system: "system", user: "user", maxTokens: 64 })
    ).rejects.toThrow("OpenAI API key is not configured");
  });

  it("fails clearly when the OpenAI model is missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-test-key");
    vi.stubEnv("OPENAI_MODEL", "");
    vi.stubEnv("AI_MODEL", "");

    await expect(
      requestChatCompletion({ system: "system", user: "user", maxTokens: 64 })
    ).rejects.toThrow("AI model is not configured");
  });

  it("only uses LiteLLM when explicitly selected", async () => {
    vi.stubEnv("AI_PROVIDER", "litellm");
    vi.stubEnv("LITELLM_BASE_URL", "http://litellm.test:4000/v1/");
    vi.stubEnv("LITELLM_API_KEY", "gateway-test-key");
    vi.stubEnv("AI_MODEL", "gateway-test-model");
    vi.stubEnv("OPENAI_API_KEY", "openai-test-key");
    vi.stubEnv("OPENAI_BASE_URL", "http://must-not-be-used.test");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 })
    );

    await requestChatCompletion({ system: "system", user: "user", maxTokens: 64 });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://litellm.test:4000/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer gateway-test-key" }),
      })
    );
  });

  it("does not fall back to LiteLLM when OpenAI is selected", async () => {
    vi.stubEnv("AI_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_MODEL", "gpt-test-model");
    vi.stubEnv("LITELLM_BASE_URL", "http://litellm.test:4000");
    vi.stubEnv("LITELLM_API_KEY", "gateway-test-key");

    await expect(
      requestChatCompletion({ system: "system", user: "user", maxTokens: 64 })
    ).rejects.toThrow("OpenAI API key is not configured");
  });
});
