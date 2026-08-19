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

export type OrgCurrentMaturity = {
  capabilityId: string;
  locationTag: string | null;
  score: number;
};

export async function getCurrentMaturityForOrganization(organizationId: string): Promise<OrgCurrentMaturity[]> {
  const rows = await prisma.maturityAssessment.findMany({
    where: { capability: { domain: { organizationId } } },
    orderBy: { assessedAt: "desc" },
    distinct: ["capabilityId", "locationTag"],
  });

  return rows.map((row) => ({
    capabilityId: row.capabilityId,
    locationTag: row.locationTag,
    score: row.score,
  }));
}
