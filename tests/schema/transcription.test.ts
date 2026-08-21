import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeAudio } from "../../lib/ai/transcription";

describe("transcribeAudio", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("fetches the audio file and sends it to Whisper, returning the transcript text", async () => {
    vi.stubEnv("LITELLM_BASE_URL", "http://litellm.test:4000");
    vi.stubEnv("LITELLM_API_KEY", "gateway-test-key");
    vi.stubEnv("AI_MODEL", "flowstate-test-model");
    vi.stubEnv("LITELLM_BASE_URL", "http://litellm.test:4000");
    vi.stubEnv("LITELLM_API_KEY", "gateway-test-key");
    vi.stubEnv("AI_MODEL", "flowstate-test-model");
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === "https://blob.example.com/interview.m4a") {
        return { ok: true, blob: async () => new Blob(["fake audio bytes"], { type: "audio/m4a" }) };
      }
      if (url === "http://litellm.test:4000/v1/audio/transcriptions") {
        return { ok: true, json: async () => ({ text: "We are losing money on night shift." }) };
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await transcribeAudio("https://blob.example.com/interview.m4a");

    expect(result).toBe("We are losing money on night shift.");
    expect(mockFetch).toHaveBeenCalledWith("https://blob.example.com/interview.m4a");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://litellm.test:4000/v1/audio/transcriptions",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws with the API's error message when Whisper returns a non-ok response", async () => {
    vi.stubEnv("LITELLM_BASE_URL", "http://litellm.test:4000");
    vi.stubEnv("LITELLM_API_KEY", "gateway-test-key");
    vi.stubEnv("AI_MODEL", "flowstate-test-model");
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === "https://blob.example.com/bad.m4a") {
        return { ok: true, blob: async () => new Blob(["fake audio bytes"], { type: "audio/m4a" }) };
      }
      return { ok: false, json: async () => ({ error: { message: "Invalid file format" } }) };
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(transcribeAudio("https://blob.example.com/bad.m4a")).rejects.toThrow(
      "Invalid file format"
    );
  });
});
