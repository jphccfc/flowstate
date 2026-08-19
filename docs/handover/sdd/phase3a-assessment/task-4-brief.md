### Task 4: Per-capability assessment history

**Files:**
- Create: `app/api/capabilities/[id]/assessment-history/route.ts`
- Test: `tests/schema/assessment-history-route.test.ts`

**Interfaces:**
- Consumes: `getCurrentMaturity` (`lib/maturity/current.ts`), `getCurrentTargetMaturity` (`lib/maturity/target.ts`, Task 2).
- Produces: `GET /api/capabilities/[id]/assessment-history` returning `{ currentAsIs, currentToBe, asIsHistory, toBeHistory }` — Task 7 (assess page) consumes this.

- [ ] **Step 1: Write the failing test**

Create `tests/schema/assessment-history-route.test.ts`:

```typescript
import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "test-user", email: "advisor@test.com" } } }) },
  }),
}));

import { GET as getHistory } from "../../app/api/capabilities/[id]/assessment-history/route";

describe("GET /api/capabilities/[id]/assessment-history", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("returns current + full history for both as-is and to-be", async () => {
    const org = await createTestOrganization({ name: "History Test Org" });
    orgId = org.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });

    await prisma.maturityAssessment.create({
      data: { capabilityId: capability.id, locationTag: null, score: 1, assessedAt: new Date("2026-01-01") },
    });
    await prisma.maturityAssessment.create({
      data: { capabilityId: capability.id, locationTag: null, score: 2, assessedAt: new Date("2026-02-01") },
    });
    await prisma.targetMaturity.create({
      data: { capabilityId: capability.id, locationTag: null, score: 4, setAt: new Date("2026-01-15") },
    });

    const res = await getHistory(new Request("http://localhost/api/capabilities/" + capability.id + "/assessment-history") as never, {
      params: Promise.resolve({ id: capability.id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.currentAsIs).toHaveLength(1);
    expect(body.currentAsIs[0]).toMatchObject({ locationTag: null, score: 2 });
    expect(body.currentToBe).toHaveLength(1);
    expect(body.currentToBe[0]).toMatchObject({ locationTag: null, score: 4 });
    expect(body.asIsHistory).toHaveLength(2);
    expect(body.asIsHistory[0].score).toBe(2); // desc order, most recent first
    expect(body.toBeHistory).toHaveLength(1);
  });

  it("404s for a nonexistent capability", async () => {
    const res = await getHistory(new Request("http://localhost/api/capabilities/does-not-exist/assessment-history") as never, {
      params: Promise.resolve({ id: "does-not-exist" }),
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- assessment-history-route`
Expected: FAIL — route doesn't exist.

- [ ] **Step 3: Create the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMaturity } from "@/lib/maturity/current";
import { getCurrentTargetMaturity } from "@/lib/maturity/target";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const capability = await prisma.capability.findUnique({ where: { id } });
  if (!capability) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [currentAsIs, currentToBe, asIsHistory, toBeHistory] = await Promise.all([
    getCurrentMaturity(id),
    getCurrentTargetMaturity(id),
    prisma.maturityAssessment.findMany({ where: { capabilityId: id }, orderBy: { assessedAt: "desc" } }),
    prisma.targetMaturity.findMany({ where: { capabilityId: id }, orderBy: { setAt: "desc" } }),
  ]);

  return NextResponse.json({ currentAsIs, currentToBe, asIsHistory, toBeHistory });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- assessment-history-route`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/capabilities/\[id\]/assessment-history tests/schema/assessment-history-route.test.ts
git commit -m "Add per-capability assessment history route"
```

---

