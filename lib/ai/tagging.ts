import { requestChatCompletion } from "@/lib/ai/client";

export type TaggableEntity = {
  targetType: "DOMAIN" | "CAPABILITY" | "KPI" | "STAKEHOLDER";
  targetId: string;
  name: string;
};

export type TagSuggestion = {
  targetType: "DOMAIN" | "CAPABILITY" | "KPI" | "STAKEHOLDER";
  targetId: string;
  confidence: number;
};

export async function generateTagSuggestions(
  segmentText: string,
  candidates: TaggableEntity[]
): Promise<TagSuggestion[]> {
  if (candidates.length === 0) return [];

  const candidateList = candidates
    .map((c) => `${c.targetId}: ${c.name} (${c.targetType})`)
    .join("\n");

  const text = await requestChatCompletion({
    maxTokens: 1024,
    system: "You tag evidence against a fixed candidate list. Return JSON only.",
    user: `Only suggest entities genuinely relevant to this evidence.

Evidence:
"${segmentText}"

Candidates (id: name (type)):
${candidateList}

Return a JSON array with exactly targetId and confidence (0 to 1). targetId must be one of the candidate ids. Only include confidence >= 0.3. Return [] if nothing is relevant.`,
  });

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  let raw: { targetId: string; confidence: number }[];
  try {
    raw = JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }

  const candidateById = new Map(candidates.map((c) => [c.targetId, c]));
  const suggestions: TagSuggestion[] = [];
  for (const item of raw) {
    const candidate = candidateById.get(item.targetId);
    const confidence = Number(item.confidence);
    if (!candidate || !Number.isFinite(confidence) || confidence < 0.3 || confidence > 1) continue;
    suggestions.push({ targetType: candidate.targetType, targetId: candidate.targetId, confidence });
  }
  return suggestions;
}
