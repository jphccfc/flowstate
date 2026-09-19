export type ScoringEvidence = { strength: "NONE" | "WEAK" | "MODERATE" | "STRONG"; confidence: number };

const strengthWeight: Record<ScoringEvidence["strength"], number> = { NONE: 0, WEAK: 1, MODERATE: 3, STRONG: 5 };

export function calculateEvidenceScore(evidence: ScoringEvidence[]): { score: number | null; evidenceCount: number; explanation: string } {
  if (!evidence.length) return { score: null, evidenceCount: 0, explanation: "No approved current evidence is available." };
  const totalWeight = evidence.reduce((sum, item) => sum + strengthWeight[item.strength] * Math.max(0, Math.min(1, item.confidence)), 0);
  const totalConfidence = evidence.reduce((sum, item) => sum + Math.max(0, Math.min(1, item.confidence)), 0);
  return { score: Math.round((totalWeight / totalConfidence) * 100) / 100, evidenceCount: evidence.length, explanation: "Average of evidence strength weighted by confidence." };
}
