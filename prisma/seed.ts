// Run with: npx tsx prisma/seed.ts
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pg = require("pg");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaPg } = require("@prisma/adapter-pg");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require("../app/generated/prisma/client");
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv/config");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const org = await prisma.organization.create({
    data: {
      name: "Demo Company Ltd",
      industry: "Technology",
      size: "51–200 employees",
      notes: "Initial capability assessment for growth planning",
    },
  });

  const domains = [
    { name: "Operations", color: "#2563eb", order: 0, capabilities: ["Process Management", "Supply Chain", "Quality Management"] },
    { name: "Financial & Legal", color: "#16a34a", order: 1, capabilities: ["Financial Planning", "Risk Management", "Compliance"] },
    { name: "People", color: "#9333ea", order: 2, capabilities: ["Talent Acquisition", "Culture & Engagement", "Learning & Development"] },
    { name: "Technology & Data", color: "#ea580c", order: 3, capabilities: ["Data Infrastructure", "Digital Tools", "Cybersecurity"] },
    { name: "Customers & Revenue", color: "#dc2626", order: 4, capabilities: ["Customer Experience", "Sales Process", "Marketing Effectiveness"] },
  ];

  for (const d of domains) {
    const domain = await prisma.businessDomain.create({
      data: {
        organizationId: org.id,
        name: d.name,
        color: d.color,
        order: d.order,
      },
    });
    for (let i = 0; i < d.capabilities.length; i++) {
      await prisma.capability.create({
        data: {
          domainId: domain.id,
          name: d.capabilities[i],
          importanceScore: 7,
          toBeScore: 8,
          order: i,
        },
      });
    }
  }

  console.log(`Seeded org: ${org.name} (${org.id})`);
}

main()
  .catch(console.error)
  .finally(() => pool.end());
