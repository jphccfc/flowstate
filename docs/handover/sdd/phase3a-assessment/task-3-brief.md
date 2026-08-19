### Task 3: Create as-is and to-be assessment entries

**Files:**
- Create: `app/api/maturity-assessments/route.ts`
- Create: `app/api/target-maturities/route.ts`
- Test: `tests/schema/maturity-create-routes.test.ts`

**Interfaces:**
- Consumes: `prisma.maturityAssessment`/`prisma.targetMaturity` from Task 1's schema.
- Produces: `POST /api/maturity-assessments` and `POST /api/target-maturities` — Tasks 5 (AI draft consumers save via these) and 7 (assess page) call these.

- [ ] **Step 1: Write the failing test**

Create `tests/schema/maturity-create-routes.test.ts`:

```typescript
import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "test-user", email: "advisor@test.com" } } }) },
  }),
}));

import { POST as createAssessment } from "../../app/api/maturity-assessments/route";
import { POST as createTarget } from "../../app/api/target-maturities/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("POST /api/maturity-assessments", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("creates an as-is entry and reads it back", async () => {
    const org = await createTestOrganization({ name: "Maturity Create Test Org" });
    orgId = org.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });

    const res = await createAssessment(
      jsonRequest({ capabilityId: capability.id, locationTag: "Brampton", score: 3, evidence: "Manual logs" })
    );
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.score).toBe(3);
    expect(created.locationTag).toBe("Brampton");
    expect(created.assessedBy).toBe("advisor@test.com");

    const found = await prisma.maturityAssessment.findUnique({ where: { id: created.id } });
    expect(found?.evidence).toBe("Manual logs");
  });

  it("rejects a non-integer score with 400", async () => {
    const org = await createTestOrganization({ name: "Maturity Reject Test Org" });
    orgId = org.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });

    const res = await createAssessment(jsonRequest({ capabilityId: capability.id, score: 3.5 }));
    expect(res.status).toBe(400);
  });

  it("rejects an out-of-range score with 400", async () => {
    const org = await createTestOrganization({ name: "Maturity Range Test Org" });
    orgId = org.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });

    const res = await createAssessment(jsonRequest({ capabilityId: capability.id, score: 9 }));
    expect(res.status).toBe(400);
  });

  it("404s for a nonexistent capability", async () => {
    const res = await createAssessment(jsonRequest({ capabilityId: "does-not-exist", score: 3 }));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/target-maturities", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("creates a to-be entry with rationale and committedBy", async () => {
    const org = await createTestOrganization({ name: "Target Create Test Org" });
    orgId = org.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });

    const res = await createTarget(
      jsonRequest({
        capabilityId: capability.id,
        score: 4,
        rationale: "Deal terms require 4 by close",
        committedBy: "CFO",
      })
    );
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.score).toBe(4);
    expect(created.rationale).toBe("Deal terms require 4 by close");
    expect(created.committedBy).toBe("CFO");
    expect(created.source).toBe("manual");
  });

  it("rejects a non-integer score with 400", async () => {
    const org = await createTestOrganization({ name: "Target Reject Test Org" });
    orgId = org.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });

    const res = await createTarget(jsonRequest({ capabilityId: capability.id, score: 2.5 }));
    expect(res.status).toBe(400);
  });

  it("404s for a nonexistent capability", async () => {
    const res = await createTarget(jsonRequest({ capabilityId: "does-not-exist", score: 3 }));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- maturity-create-routes`
Expected: FAIL — routes don't exist.

- [ ] **Step 3: Create `app/api/maturity-assessments/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { capabilityId, locationTag, score, evidence, sourceSegmentIds } = body;

  if (!capabilityId || typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 5) {
    return NextResponse.json({ error: "capabilityId and an integer score (0-5) are required" }, { status: 400 });
  }

  const capability = await prisma.capability.findUnique({ where: { id: capabilityId } });
  if (!capability) return NextResponse.json({ error: "Capability not found" }, { status: 404 });

  const assessment = await prisma.maturityAssessment.create({
    data: {
      capabilityId,
      locationTag: locationTag ?? null,
      score,
      evidence: evidence ?? null,
      sourceSegmentIds: sourceSegmentIds ?? [],
      assessedBy: user.email ?? undefined,
    },
  });

  return NextResponse.json(assessment, { status: 201 });
}
```

- [ ] **Step 4: Create `app/api/target-maturities/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { capabilityId, locationTag, score, rationale, committedBy, source, sourceSegmentIds } = body;

  if (!capabilityId || typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 5) {
    return NextResponse.json({ error: "capabilityId and an integer score (0-5) are required" }, { status: 400 });
  }

  const capability = await prisma.capability.findUnique({ where: { id: capabilityId } });
  if (!capability) return NextResponse.json({ error: "Capability not found" }, { status: 404 });

  const target = await prisma.targetMaturity.create({
    data: {
      capabilityId,
      locationTag: locationTag ?? null,
      score,
      rationale: rationale ?? null,
      committedBy: committedBy ?? null,
      source: source ?? "manual",
      sourceSegmentIds: sourceSegmentIds ?? [],
      setBy: user.email ?? undefined,
    },
  });

  return NextResponse.json(target, { status: 201 });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- maturity-create-routes`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add app/api/maturity-assessments app/api/target-maturities tests/schema/maturity-create-routes.test.ts
git commit -m "Add creation routes for as-is (MaturityAssessment) and to-be (TargetMaturity) entries"
```

---

