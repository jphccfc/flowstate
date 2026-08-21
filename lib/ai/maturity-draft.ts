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
