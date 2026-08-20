import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../../app/generated/prisma/client";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

export async function createTestOrganization(overrides?: { name?: string }) {
  const organization = await prisma.organization.create({
    data: {
      name: overrides?.name ?? `Test Org ${Date.now()}`,
      industry: "Manufacturing",
    },
  });
  // Route tests authenticate with these stable Supabase fixture emails.
  for (const email of [
    "advisor@test.com",
    "session-advisor@test.com",
    "recommendation-advisor@test.com",
    "suggest-advisor@test.com",
  ]) {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, role: "ADVISOR" },
    });
    await prisma.userOrganization.create({
      data: { userId: user.id, organizationId: organization.id, role: "ADVISOR" },
    });
  }
  return organization;
}

export async function cleanupOrganization(id: string) {
  await prisma.organization.delete({ where: { id } });
}
