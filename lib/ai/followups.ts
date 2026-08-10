export async function generateFollowUpSuggestions(
  latestSegmentText: string,
  touchedAreaNames: string[]
): Promise<string[]> {
  const areasList = touchedAreaNames.length > 0 ? touchedAreaNames.join(", ") : "(none yet)";

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
          content: `You are assisting an advisor conducting a live capability-assessment interview. Suggest specific, non-redundant follow-up questions based on what was just said.

Just captured:
"${latestSegmentText}"

Capability/domain/KPI/stakeholder areas already touched in this session: ${areasList}

Return a JSON array of 1-3 short follow-up question strings the advisor could ask next. Return [] if the segment is off-topic or nothing useful comes to mind. Do not repeat questions about areas that seem already thoroughly covered.`,
        },
      ],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text ?? "[]";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed) ? parsed.filter((q: unknown): q is string => typeof q === "string") : [];
  } catch {
    return [];
  }
}
