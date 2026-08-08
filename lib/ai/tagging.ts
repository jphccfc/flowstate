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

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are tagging a segment of an interview transcript or document against a fixed list of candidate entities. Only suggest entities that are genuinely relevant to the segment text.

Segment:
"${segmentText}"

Candidates (id: name (type)):
${candidateList}

Return a JSON array of objects with exactly these fields: targetId (must be one of the candidate ids above, verbatim), confidence (0 to 1, how confident you are this segment relates to that entity). Only include entities with confidence >= 0.3. Return [] if nothing is relevant.`,
        },
      ],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text ?? "[]";
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
    if (!candidate) continue;
    suggestions.push({
      targetType: candidate.targetType,
      targetId: candidate.targetId,
      confidence: item.confidence,
    });
  }
  return suggestions;
}
