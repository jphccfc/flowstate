import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../../app/generated/prisma/client";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

export async function createTestOrganization(overrides?: { name?: string }) {
  return prisma.organization.create({
    data: {
      name: overrides?.name ?? `Test Org ${Date.now()}`,
      industry: "Manufacturing",
    },
  });
}

export async function cleanupOrganization(id: string) {
  await prisma.organization.delete({ where: { id } });
}
