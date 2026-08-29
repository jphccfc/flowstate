import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  prisma: {
    capturedInput: { create: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => db);
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { email: "advisor@test.com" } } }) },
  }),
}));
vi.mock("@/lib/auth/organization", () => ({ canAccessClient: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/ingestion/pipeline", () => ({ processCapturedInput: vi.fn() }));
vi.mock("@vercel/blob", () => ({ put: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));

import { POST } from "../../app/api/captured-inputs/route";

function request() {
  const formData = new FormData();
  formData.set("organizationId", "org-1");
  formData.set("type", "TEXT_NOTE");
  formData.set("rawText", "A note");
  return new Request("http://localhost/api/captured-inputs", { method: "POST", body: formData }) as never;
}

describe("captured input POST error responses", () => {
  it("returns the persistence error as JSON instead of an unstructured 500", async () => {
    db.prisma.capturedInput.create.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "database unavailable" });
  });
});
