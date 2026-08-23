import { requestChatCompletion } from "@/lib/ai/client";

function extractObject(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]) as Record<string, unknown>; } catch { return null; }
}

export async function draftAsIsScore(capabilityName: string, evidenceTexts: string[]): Promise<{ score: number; evidence: string }> {
  const evidenceList = evidenceTexts.length > 0 ? evidenceTexts.map((t, i) => `${i + 1}. ${t}`).join("\n") : "(no evidence captured yet)";
  const text = await requestChatCompletion({
    maxTokens: 512,
    system: "You draft current-state maturity assessments. Return JSON only.",
    user: `Draft a current-state maturity score for this capability on a 0-5 scale.

Capability: "${capabilityName}"
Evidence:
${evidenceList}

Return exactly: { score: integer 0-5, evidence: short grounded summary }. If there is no evidence, return score 0 and explain that nothing has been captured.`,
  });
  const parsed = extractObject(text);
  const score = Math.max(0, Math.min(5, Math.round(Number(parsed?.score) || 0)));
  return { score, evidence: typeof parsed?.evidence === "string" ? parsed.evidence : "" };
}

export async function draftToBeScore(capabilityName: string, engagementMotive: string | null, kpiTargets: string[]): Promise<{ score: number; rationale: string }> {
  const motiveText = engagementMotive ?? "(not specified)";
  const kpiList = kpiTargets.length > 0 ? kpiTargets.join("\n") : "(no KPI targets captured yet)";
  const text = await requestChatCompletion({
    maxTokens: 512,
    system: "You draft target-state maturity assessments. Return JSON only.",
    user: `Draft a suggested target maturity score on a 0-5 scale. This is a suggestion for stakeholder confirmation, not a final answer.

Capability: "${capabilityName}"
Engagement motive: ${motiveText}
Related KPI targets:
${kpiList}

Return exactly: { score: integer 0-5, rationale: short justification }.`,
  });
  const parsed = extractObject(text);
  const score = Math.max(0, Math.min(5, Math.round(Number(parsed?.score) || 0)));
  return { score, rationale: typeof parsed?.rationale === "string" ? parsed.rationale : "" };
}


export type MaturityProposalDraft = { interpretation: string; suggestedScore: number | null; scoreRangeMin: number | null; scoreRangeMax: number | null; confidence: number | null; missingEvidence: string[]; conflictingEvidence: string[] };

export async function draftMaturityProposal(capabilityName: string, evidenceTexts: string[], perspectiveTexts: string[]): Promise<MaturityProposalDraft> {
  const evidence = evidenceTexts.length ? evidenceTexts.map((text, index) => `${index + 1}. ${text}`).join("\n") : "(no approved evidence)";
  const perspectives = perspectiveTexts.length ? perspectiveTexts.map((text, index) => `${index + 1}. ${text}`).join("\n") : "(no stakeholder perspectives)";
  const text = await requestChatCompletion({ maxTokens: 768, system: "You propose evidence-backed maturity interpretations. Return JSON only. Never claim approval.", user: `Propose a provisional maturity assessment for capability "${capabilityName}" on a 0-5 scale.
Approved evidence:
${evidence}
Stakeholder perspectives:
${perspectives}
Return exactly JSON with interpretation, suggestedScore (0-5 or null), scoreRangeMin, scoreRangeMax, confidence (0-1), missingEvidence (array), conflictingEvidence (array).` });
  const parsed = extractObject(text);
  const numberOrNull = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(5, value)) : null;
  const confidence = typeof parsed?.confidence === "number" && Number.isFinite(parsed.confidence) ? Math.max(0, Math.min(1, parsed.confidence)) : null;
  return { interpretation: typeof parsed?.interpretation === "string" ? parsed.interpretation : "", suggestedScore: numberOrNull(parsed?.suggestedScore), scoreRangeMin: numberOrNull(parsed?.scoreRangeMin), scoreRangeMax: numberOrNull(parsed?.scoreRangeMax), confidence, missingEvidence: Array.isArray(parsed?.missingEvidence) ? parsed.missingEvidence.filter((item): item is string => typeof item === "string") : [], conflictingEvidence: Array.isArray(parsed?.conflictingEvidence) ? parsed.conflictingEvidence.filter((item): item is string => typeof item === "string") : [] };
}
