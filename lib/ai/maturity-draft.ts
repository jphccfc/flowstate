export async function draftAsIsScore(
  capabilityName: string,
  evidenceTexts: string[]
): Promise<{ score: number; evidence: string }> {
  const evidenceList =
    evidenceTexts.length > 0 ? evidenceTexts.map((t, i) => `${i + 1}. ${t}`).join("\n") : "(no evidence captured yet)";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `You are drafting a current-state (as-is) maturity score for a business capability, on a 0-5 scale (0 = does not exist / entirely ad hoc, 5 = best-in-class, fully optimized and measured).

Capability: "${capabilityName}"

Evidence gathered from interviews/documents:
${evidenceList}

Return a JSON object with exactly these fields: score (integer 0-5), evidence (a short 1-3 sentence summary of why, grounded in the evidence above). If there's no evidence, return score 0 and evidence explaining nothing has been captured yet.`,
        },
      ],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text ?? "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { score: 0, evidence: "" };

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const score = Math.max(0, Math.min(5, Math.round(Number(parsed.score) || 0)));
    return { score, evidence: typeof parsed.evidence === "string" ? parsed.evidence : "" };
  } catch {
    return { score: 0, evidence: "" };
  }
}

export async function draftToBeScore(
  capabilityName: string,
  engagementMotive: string | null,
  kpiTargets: string[]
): Promise<{ score: number; rationale: string }> {
  const motiveText = engagementMotive ?? "(not specified)";
  const kpiList = kpiTargets.length > 0 ? kpiTargets.join("\n") : "(no KPI targets captured yet)";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `You are drafting a target (to-be) maturity score for a business capability, on a 0-5 scale (0 = does not exist, 5 = best-in-class). This is a suggested starting point for a stakeholder to confirm or override — not a final answer.

Capability: "${capabilityName}"
Engagement motive: ${motiveText}
Related KPI targets: ${kpiList}

Return a JSON object with exactly these fields: score (integer 0-5), rationale (a short 1-2 sentence justification referencing the engagement motive and/or KPI targets where relevant).`,
        },
      ],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text ?? "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { score: 0, rationale: "" };

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const score = Math.max(0, Math.min(5, Math.round(Number(parsed.score) || 0)));
    return { score, rationale: typeof parsed.rationale === "string" ? parsed.rationale : "" };
  } catch {
    return { score: 0, rationale: "" };
  }
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
