import { prisma } from "@/lib/db";
import type { OrgCurrentMaturity } from "./current";

export type CurrentMaturity = {
  locationTag: string | null;
  score: number;
  setAt: Date;
};

export async function getCurrentTargetMaturity(capabilityId: string): Promise<CurrentMaturity[]> {
  const rows = await prisma.targetMaturity.findMany({
    where: { capabilityId },
    orderBy: { setAt: "desc" },
  });

  const latestByLocation = new Map<string | null, CurrentMaturity>();
  for (const row of rows) {
    if (!latestByLocation.has(row.locationTag)) {
      latestByLocation.set(row.locationTag, {
        locationTag: row.locationTag,
        score: row.score,
        setAt: row.setAt,
      });
    }
  }

  return Array.from(latestByLocation.values());
}

export async function getCurrentTargetMaturityForOrganization(organizationId: string): Promise<OrgCurrentMaturity[]> {
  const rows = await prisma.targetMaturity.findMany({
    where: { capability: { domain: { organizationId } } },
    orderBy: { setAt: "desc" },
    distinct: ["capabilityId", "locationTag"],
  });

  return rows.map((row) => ({
    capabilityId: row.capabilityId,
    locationTag: row.locationTag,
    score: row.score,
  }));
}
