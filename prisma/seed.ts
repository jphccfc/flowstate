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
      name: "Window & Door Manufacturing Co.",
      industry: "Manufacturing",
      size: "201–500 employees",
      notes: "Due diligence engagement. Two locations: Alexandria and Brampton (Brampton includes extrusion). Losing money, shift work, seasonal demand.",
    },
  });

  const domains = [
    { name: "Operations", color: "#2563eb", order: 0, capabilities: ["Shift Scheduling", "Extrusion Process Control", "Quality Management"] },
    { name: "Financial & Legal", color: "#16a34a", order: 1, capabilities: ["Financial Planning", "PO Reconciliation"] },
    { name: "People", color: "#9333ea", order: 2, capabilities: ["Talent Acquisition", "Shift Labor Cost Management"] },
    { name: "Technology & Data", color: "#ea580c", order: 3, capabilities: ["CRM Data Accuracy", "Inventory Tracking"] },
    { name: "Customers & Revenue", color: "#dc2626", order: 4, capabilities: ["Sales Process", "Seasonal Demand Planning"] },
  ];

  const capabilityByName: Record<string, string> = {};

  for (const d of domains) {
    const domain = await prisma.businessDomain.create({
      data: { organizationId: org.id, name: d.name, color: d.color, order: d.order },
    });
    for (let i = 0; i < d.capabilities.length; i++) {
      const capability = await prisma.capability.create({
        data: { domainId: domain.id, name: d.capabilities[i], importanceScore: 7, order: i },
      });
      capabilityByName[d.capabilities[i]] = capability.id;
    }
  }

  const stakeholders = await Promise.all([
    prisma.stakeholder.create({ data: { organizationId: org.id, name: "Priya Nair", role: "Plant Manager, Brampton" } }),
    prisma.stakeholder.create({ data: { organizationId: org.id, name: "Marc Dubois", role: "Operations Director, Alexandria" } }),
    prisma.stakeholder.create({ data: { organizationId: org.id, name: "Sam Okafor", role: "CFO" } }),
  ]);

  const salesKpi = await prisma.kPI.create({
    data: { organizationId: org.id, name: "Quarterly Sales Target", targetValue: "$2.4M", currentValue: "$2.1M" },
  });
  const deliveryKpi = await prisma.kPI.create({
    data: { organizationId: org.id, name: "On-time Delivery Rate", targetValue: "95%", currentValue: "81%" },
  });

  const extrusionCapabilityId = capabilityByName["Extrusion Process Control"];
  const crmCapabilityId = capabilityByName["CRM Data Accuracy"];

  // Ingestion + tagging: a captured interview segment from the Brampton plant manager
  const captured = await prisma.capturedInput.create({
    data: {
      organizationId: org.id,
      type: "AUDIO",
      locationTag: "Brampton",
      status: "TAGGED",
      rawText: "We're losing money on night shift. The extrusion line logs everything on paper, so nobody knows real-time yield until the next morning.",
      segments: {
        create: [
          {
            order: 0,
            speaker: "Priya Nair",
            text: "We're losing money on night shift. The extrusion line logs everything on paper, so nobody knows real-time yield until the next morning.",
          },
        ],
      },
    },
    include: { segments: true },
  });

  await prisma.tag.create({
    data: {
      segmentId: captured.segments[0].id,
      targetType: "CAPABILITY",
      targetId: extrusionCapabilityId,
      confidence: 0.91,
      status: "AUTO_APPROVED",
    },
  });

  // Versioned maturity assessments — location-specific for Brampton extrusion
  await prisma.maturityAssessment.create({
    data: {
      capabilityId: extrusionCapabilityId,
      locationTag: "Brampton",
      score: 2,
      evidence: "Paper logs only, no real-time yield visibility",
      sourceSegmentIds: [captured.segments[0].id],
      assessedBy: stakeholders[0].id,
    },
  });

  // Alexandria has no extrusion — org-wide/other capability assessed instead
  await prisma.maturityAssessment.create({
    data: {
      capabilityId: crmCapabilityId,
      locationTag: "Alexandria",
      score: 3,
      evidence: "CRM in place but sales reps skip required fields",
    },
  });

  await prisma.capabilityKPIMaturityCeiling.create({
    data: {
      capabilityId: extrusionCapabilityId,
      kpiId: deliveryKpi.id,
      maturityLevel: 2,
      targetCeilingMin: 75,
      targetCeilingMax: 82,
      valueToNextLevel: 250000,
      notes: "Digitizing extrusion yield tracking unlocks same-day corrective action",
    },
  });

  // Cross-domain dependency: CRM data accuracy cascades into sales/finance targets
  await prisma.dependency.create({
    data: {
      type: "CAPABILITY_TO_KPI",
      sourceType: "CAPABILITY",
      sourceId: crmCapabilityId,
      targetType: "KPI",
      targetId: salesKpi.id,
      description: "Inaccurate CRM data produces incorrect quarterly sales forecasts",
    },
  });

  // A stakeholder conflict: ops says inventory is fine, finance disagrees
  await prisma.conflictFlag.create({
    data: {
      entityType: "CAPABILITY",
      entityId: capabilityByName["Inventory Tracking"],
      claims: [
        { stakeholderId: stakeholders[0].id, statement: "Inventory tracking is fine" },
        { stakeholderId: stakeholders[2].id, statement: "PO reconciliation is broken, inventory counts don't match" },
      ],
    },
  });

  // A draft recommendation
  await prisma.recommendation.create({
    data: {
      organizationId: org.id,
      title: "Digitize extrusion yield tracking at Brampton",
      description: "Replace paper logs with a real-time yield dashboard on the extrusion line to close the on-time delivery gap.",
      relatedCapabilityIds: [extrusionCapabilityId],
      relatedKPIIds: [deliveryKpi.id],
      estimatedValue: 250000,
      priorityScore: 8.5,
      status: "DRAFT",
    },
  });

  console.log(`Seeded org: ${org.name} (${org.id})`);
}

main()
  .catch(console.error)
  .finally(() => pool.end());
