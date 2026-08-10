import { prisma } from "@/lib/db";

export type CurrentMaturity = {
  locationTag: string | null;
  score: number;
  assessedAt: Date;
};

export async function getCurrentMaturity(capabilityId: string): Promise<CurrentMaturity[]> {
  const rows = await prisma.maturityAssessment.findMany({
    where: { capabilityId },
    orderBy: { assessedAt: "desc" },
  });

  const latestByLocation = new Map<string | null, CurrentMaturity>();
  for (const row of rows) {
    if (!latestByLocation.has(row.locationTag)) {
      latestByLocation.set(row.locationTag, {
        locationTag: row.locationTag,
        score: row.score,
        assessedAt: row.assessedAt,
      });
    }
  }

  return Array.from(latestByLocation.values());
}
