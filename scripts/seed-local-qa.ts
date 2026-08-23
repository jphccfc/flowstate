import { prisma } from "../lib/db";

const organizationId = "local-qa-organization";
const domainId = "local-qa-domain";
const capabilityId = "local-qa-capability";
const userId = "local-qa-user";

async function main() {
await prisma.user.upsert({
  where: { id: userId },
  update: { email: "qa@flowstate.local", name: "Local QA", role: "ADVISOR" },
  create: { id: userId, email: "qa@flowstate.local", name: "Local QA", role: "ADVISOR" },
});
await prisma.organization.upsert({
  where: { id: organizationId },
  update: { name: "Flowstate Local QA" },
  create: { id: organizationId, name: "Flowstate Local QA", industry: "QA" },
});
await prisma.userOrganization.upsert({
  where: { userId_organizationId: { userId, organizationId } },
  update: { role: "ADVISOR" },
  create: { userId, organizationId, role: "ADVISOR" },
});
await prisma.businessDomain.upsert({
  where: { id: domainId },
  update: { name: "Local QA Domain", order: 0 },
  create: { id: domainId, organizationId, name: "Local QA Domain", order: 0 },
});
await prisma.capability.upsert({
  where: { id: capabilityId },
  update: { name: "Assessment save and gap calculation", order: 0 },
  create: { id: capabilityId, domainId, name: "Assessment save and gap calculation", description: "Local-only browser verification capability", order: 0 },
});
console.log(JSON.stringify({ organizationId, capabilityId, userEmail: "qa@flowstate.local" }));
await prisma.$disconnect();
}
main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
