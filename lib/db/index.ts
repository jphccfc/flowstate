// eslint-disable-next-line @typescript-eslint/no-require-imports
const pg = require("pg");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaPg } = require("@prisma/adapter-pg");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require("../../app/generated/prisma/client");

type PrismaClientType = typeof import("../../app/generated/prisma/client").PrismaClient;
type PrismaInstance = InstanceType<PrismaClientType>;

const globalForPrisma = globalThis as unknown as { prisma: PrismaInstance };

function createPrismaClient(): PrismaInstance {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma: PrismaInstance = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
