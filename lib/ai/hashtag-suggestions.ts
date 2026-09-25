import { requestChatCompletion } from "@/lib/ai/client";
import { normalizeHashtag } from "@/lib/tags/hashtags";

export type HashtagSuggestion = {
  normalizedName: string;
  displayName: string;
  confidence: number;
  rationale: string | null;
};

const MAX_SUGGESTIONS = 5;
const MIN_CONFIDENCE = 0.4;
const MAX_TEXT_CHARS = 12_000;

type Complete = typeof requestChatCompletion;

export async function generateHashtagSuggestions(input: {
  sourceType: string;
  sourceName: string;
  text: string;
  vocabulary: string[];
  complete?: Complete;
}): Promise<HashtagSuggestion[]> {
  const complete = input.complete ?? requestChatCompletion;
  const source = input.text.trim();
  if (!source) return [];

  const response = await complete({
    maxTokens: 700,
    system: "You suggest reusable discovery hashtags for business evidence. Return JSON only. Do not make assessment decisions or infer a capability score.",
    user: `Source type: ${input.sourceType}
Source name: ${input.sourceName}
Existing workspace hashtag vocabulary:\n${input.vocabulary.length ? input.vocabulary.map((tag) => `#${tag}`).join("\n") : "(none)"}

Evidence text:\n"""\n${source.slice(0, MAX_TEXT_CHARS)}\n"""

Return a JSON array of at most ${MAX_SUGGESTIONS} objects:
{ "name": "short reusable phrase", "confidence": 0 to 1, "rationale": "brief evidence-grounded reason" }

Rules:
- Prefer an exact existing vocabulary tag when appropriate.
- Suggest only durable discovery themes: project, person, action, recommendation, decision, location or knowledge topic.
- Do not suggest generic words, primary domains, capability names, or unsupported facts.
- A hashtag must be 1-80 characters after normalization.
- Do not use # in name.`,
  });

  const match = response.match(/\[[\s\S]*\]/);
  if (!match) return [];
  let candidates: unknown;
  try { candidates = JSON.parse(match[0]); } catch { return []; }
  if (!Array.isArray(candidates)) return [];

  const seen = new Set<string>();
  const suggestions: HashtagSuggestion[] = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object" || suggestions.length >= MAX_SUGGESTIONS) continue;
    const { name, confidence, rationale } = candidate as Record<string, unknown>;
    if (typeof name !== "string") continue;
    const parsedConfidence = Number(confidence);
    if (!Number.isFinite(parsedConfidence) || parsedConfidence < MIN_CONFIDENCE || parsedConfidence > 1) continue;

    let normalizedName: string;
    try { normalizedName = normalizeHashtag(name); } catch { continue; }
    if (seen.has(normalizedName)) continue;
    seen.add(normalizedName);
    suggestions.push({
      normalizedName,
      displayName: name.trim().replace(/^#+/, "").slice(0, 80),
      confidence: parsedConfidence,
      rationale: typeof rationale === "string" && rationale.trim() ? rationale.trim().slice(0, 500) : null,
    });
  }
  return suggestions;
}
