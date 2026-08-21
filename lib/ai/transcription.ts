import { getAIGatewayConfig } from "@/lib/ai/client";

export async function transcribeAudio(audioUrl: string): Promise<string> {
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) throw new Error("Audio source could not be loaded");
  const audioBlob = await audioResponse.blob();
  const { baseUrl, apiKey } = getAIGatewayConfig();

  const formData = new FormData();
  const name = audioUrl.split("/").pop() ?? "audio.m4a";
  formData.append("file", audioBlob, name);
  formData.append("model", process.env.AI_TRANSCRIPTION_MODEL?.trim() || "whisper-1");

  const response = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message ?? `Audio transcription failed (${response.status})`);
  return typeof data.text === "string" ? data.text : "";
}
