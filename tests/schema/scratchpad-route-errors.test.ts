import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const db = vi.hoisted(() => ({
  prisma: {
    capturedInput: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    assessmentSession: { findFirst: vi.fn() },
    meetingContext: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => db);
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { email: "advisor@test.com" } } }) } }),
}));
vi.mock("@/lib/auth/organization", () => ({
  canAccessClient: vi.fn().mockResolvedValue(true),
  hasOrganizationPermission: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/ingestion/pipeline", () => ({ processCapturedInput: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: vi.fn() }));

import { GET as getCapturedInputs } from "../../app/api/captured-inputs/route";
import { GET as getScratchpad } from "../../app/api/scratchpad/route";

async function expectSafeDatabaseError(response: Response) {
  expect(response.status).toBe(500);
  const body = await response.json();
  expect(body.error).toBe("Unable to load captured inputs");
  expect(body.requestId).toEqual(expect.any(String));
  expect(body.error).not.toContain("column");
}

describe("captured input read failures", () => {
  it("does not eagerly import document extraction for Scratch Pad routes", () => {
    const pipeline = readFileSync(resolve(process.cwd(), "lib/ingestion/pipeline.ts"), "utf8");
    expect(pipeline).not.toMatch(/^import .*extractDocumentText .*from .*documents\/extraction/m);
  });

  it("returns a safe correlated error instead of throwing a Prisma schema error", async () => {
    db.prisma.capturedInput.findMany.mockRejectedValueOnce(new Error("column CapturedInput.reviewStatus does not exist"));

    await expectSafeDatabaseError(await getCapturedInputs(new Request("http://localhost/api/captured-inputs?organizationId=org-1") as never));
  });

  it("returns the same safe contract for Scratch Pad reads", async () => {
    db.prisma.capturedInput.findMany.mockRejectedValueOnce(new Error("column CapturedInput.reviewStatus does not exist"));

    const response = await getScratchpad(new Request("http://localhost/api/scratchpad?organizationId=org-1") as never);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Unable to load Scratch Pad");
    expect(body.requestId).toEqual(expect.any(String));
  });
});
