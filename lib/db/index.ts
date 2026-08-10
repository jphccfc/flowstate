import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../../app/generated/prisma/client";

type PrismaClientType = typeof PrismaClient;
type PrismaInstance = InstanceType<PrismaClientType>;

const globalForPrisma = globalThis as unknown as { prisma: PrismaInstance };

function createPrismaClient(): PrismaInstance {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma: PrismaInstance = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
