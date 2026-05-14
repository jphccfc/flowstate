export type CapabilityScore = {
  id: string;
  name: string;
  asIsScore: number | null;
  toBeScore: number | null;
  importanceScore: number | null;
  gapScore: number | null;
};

export type DomainScore = {
  id: string;
  name: string;
  color: string | null;
  averageAsIs: number;
  averageToBe: number;
  averageGap: number;
  capabilities: CapabilityScore[];
};

export function calculateGap(
  asIs: number | null,
  toBe: number | null
): number | null {
  if (asIs == null || toBe == null) return null;
  return Math.max(0, toBe - asIs);
}

export function calculateDomainScore(
  capabilities: CapabilityScore[]
): { averageAsIs: number; averageToBe: number; averageGap: number } {
  const scored = capabilities.filter(
    (c) => c.asIsScore != null && c.toBeScore != null
  );
  if (scored.length === 0) {
    return { averageAsIs: 0, averageToBe: 0, averageGap: 0 };
  }

  const totalImportance = scored.reduce(
    (sum, c) => sum + (c.importanceScore ?? 5),
    0
  );

  const weightedAsIs = scored.reduce(
    (sum, c) => sum + (c.asIsScore ?? 0) * (c.importanceScore ?? 5),
    0
  );
  const weightedToBe = scored.reduce(
    (sum, c) => sum + (c.toBeScore ?? 0) * (c.importanceScore ?? 5),
    0
  );

  const averageAsIs = totalImportance > 0 ? weightedAsIs / totalImportance : 0;
  const averageToBe = totalImportance > 0 ? weightedToBe / totalImportance : 0;
  const averageGap = Math.max(0, averageToBe - averageAsIs);

  return {
    averageAsIs: Math.round(averageAsIs * 10) / 10,
    averageToBe: Math.round(averageToBe * 10) / 10,
    averageGap: Math.round(averageGap * 10) / 10,
  };
}

export function buildRadarData(domains: DomainScore[]) {
  return domains.map((d) => ({
    domain: d.name,
    "As-Is": d.averageAsIs,
    "To-Be": d.averageToBe,
    gap: d.averageGap,
  }));
}

export function getGapSeverity(gap: number | null): "none" | "low" | "medium" | "high" | "critical" {
  if (gap == null) return "none";
  if (gap <= 1) return "low";
  if (gap <= 2) return "medium";
  if (gap <= 3) return "high";
  return "critical";
}

export function getGapColor(severity: ReturnType<typeof getGapSeverity>): string {
  const colors = {
    none: "#e5e7eb",
    low: "#bbf7d0",
    medium: "#fef08a",
    high: "#fca5a5",
    critical: "#f87171",
  };
  return colors[severity];
}

export function getOverallMaturity(domains: DomainScore[]): number {
  const scored = domains.filter((d) => d.averageAsIs > 0);
  if (scored.length === 0) return 0;
  const avg = scored.reduce((sum, d) => sum + d.averageAsIs, 0) / scored.length;
  return Math.round(avg * 10) / 10;
}
