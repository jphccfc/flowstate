import { requestChatCompletion } from "@/lib/ai/client";

export async function generateFollowUpSuggestions(
  latestSegmentText: string,
  touchedAreaNames: string[]
): Promise<string[]> {
  const areasList = touchedAreaNames.length > 0 ? touchedAreaNames.join(", ") : "(none yet)";
  const text = await requestChatCompletion({
    maxTokens: 512,
    system: "You assist an advisor conducting a capability-assessment interview. Return JSON only.",
    user: `Suggest specific, non-redundant follow-up questions based on this evidence.

Just captured:
"${latestSegmentText}"

Areas already touched in this session: ${areasList}

Return a JSON array of 1-3 short question strings. Return [] if nothing useful comes to mind.`,
  });

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed) ? parsed.filter((q: unknown): q is string => typeof q === "string") : [];
  } catch {
    return [];
  }
}
