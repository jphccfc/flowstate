import { requestChatCompletion } from "@/lib/ai/client";

type ValidationDraft = { interpretation: string; confidence: number | null; missingEvidence: string[]; conflictingEvidence: string[] };

export async function validateMaturityRating(capabilityName: string, approvedScore: number | null, evidenceTexts: string[], perspectiveTexts: string[]): Promise<ValidationDraft> {
  const evidence = evidenceTexts.length ? evidenceTexts.map((text, i) => `${i + 1}. ${text}`).join("\n") : "(no approved evidence)";
  const perspectives = perspectiveTexts.length ? perspectiveTexts.map((text, i) => `${i + 1}. ${text}`).join("\n") : "(no perspectives)";
  const text = await requestChatCompletion({ maxTokens: 768, system: "You validate an existing maturity rating against evidence. Return JSON only; never approve or change the rating.", user: `Review the approved score for capability "${capabilityName}". Approved score: ${approvedScore ?? "unknown"}.\nEvidence:\n${evidence}\nPerspectives:\n${perspectives}\nReturn exactly JSON with interpretation, confidence (0-1), missingEvidence (array), conflictingEvidence (array). Classify whether sources support, partially support, conflict with, or are insufficient for the existing score.` });
  const match = text.match(/\{[\s\S]*\}/);
  let parsed: Record<string, unknown> = {};
  try { parsed = match ? JSON.parse(match[0]) as Record<string, unknown> : {}; } catch { /* handled as empty draft */ }
  const confidence = typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence) ? Math.max(0, Math.min(1, parsed.confidence)) : null;
  const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  return { interpretation: typeof parsed.interpretation === "string" ? parsed.interpretation : "", confidence, missingEvidence: strings(parsed.missingEvidence), conflictingEvidence: strings(parsed.conflictingEvidence) };
}
