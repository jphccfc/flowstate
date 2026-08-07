import { afterAll, describe, expect, it } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

describe("test infrastructure smoke test", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("creates and reads back an Organization against the real database", async () => {
    const org = await createTestOrganization({ name: "Smoke Test Org" });
    orgId = org.id;

    const found = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(found.name).toBe("Smoke Test Org");
  });
});
