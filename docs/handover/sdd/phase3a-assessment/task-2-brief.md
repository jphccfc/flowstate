### Task 2: Current-maturity helpers, scoring engine rewrite, client route embedding

**Files:**
- Modify: `lib/maturity/current.ts`
- Create: `lib/maturity/target.ts`
- Modify: `lib/scoring/engine.ts`
- Modify: `app/api/clients/[id]/route.ts` (`GET` only — `PATCH` untouched here, extended in Task 6)
- Test: `tests/unit/scoring-engine.test.ts`
- Test: `tests/schema/maturity-target.test.ts`
- Test: `tests/schema/clients-route.test.ts`

**Interfaces:**
- Consumes: `TargetMaturity`/`Capability.tags`/`Organization.engagementMotive` from Task 1's schema.
- Produces: `getCurrentMaturityForOrganization(organizationId): Promise<OrgCurrentMaturity[]>` and `OrgCurrentMaturity` type (`{ capabilityId, locationTag, score }`) from `lib/maturity/current.ts`. `getCurrentTargetMaturity(capabilityId): Promise<CurrentMaturity[]>` and `getCurrentTargetMaturityForOrganization(organizationId): Promise<OrgCurrentMaturity[]>` from `lib/maturity/target.ts`. `MaturitySnapshot` type (`{ locationTag: string | null; score: number }`), `averageScore(snapshots: MaturitySnapshot[]): number | null`, `calculateGap(asIs: MaturitySnapshot[], toBe: MaturitySnapshot[]): number | null`, `calculateDomainScore(capabilities: CapabilityMaturity[]): { averageAsIs, averageToBe, averageGap, capabilities: CapabilityScore[] }` from `lib/scoring/engine.ts` — Tasks 7/8/9 (UI) consume these directly.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/scoring-engine.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { averageScore, calculateGap, calculateDomainScore } from "../../lib/scoring/engine";

describe("averageScore", () => {
  it("returns null for an empty list", () => {
    expect(averageScore([])).toBeNull();
  });

  it("averages scores across locations", () => {
    expect(averageScore([{ locationTag: "Alexandria", score: 3 }, { locationTag: "Brampton", score: 2 }])).toBe(2.5);
  });

  it("returns the single value for one org-wide entry", () => {
    expect(averageScore([{ locationTag: null, score: 4 }])).toBe(4);
  });
});

describe("calculateGap", () => {
  it("returns null when as-is has no data", () => {
    expect(calculateGap([], [{ locationTag: null, score: 5 }])).toBeNull();
  });

  it("returns null when to-be has no data", () => {
    expect(calculateGap([{ locationTag: null, score: 2 }], [])).toBeNull();
  });

  it("computes a simple org-wide gap", () => {
    expect(calculateGap([{ locationTag: null, score: 2 }], [{ locationTag: null, score: 5 }])).toBe(3);
  });

  it("matches to-be by the same location when both are location-scoped", () => {
    const asIs = [{ locationTag: "Alexandria", score: 3 }, { locationTag: "Brampton", score: 1 }];
    const toBe = [{ locationTag: "Alexandria", score: 4 }, { locationTag: "Brampton", score: 3 }];
    // Alexandria gap 1, Brampton gap 2 -> avg asIs 2, avg matched toBe 3.5 -> gap 1.5
    expect(calculateGap(asIs, toBe)).toBe(1.5);
  });

  it("falls back to the org-wide target when no location-specific target exists", () => {
    const asIs = [{ locationTag: "Brampton", score: 2 }];
    const toBe = [{ locationTag: null, score: 5 }];
    expect(calculateGap(asIs, toBe)).toBe(3);
  });

  it("never returns a negative gap", () => {
    expect(calculateGap([{ locationTag: null, score: 5 }], [{ locationTag: null, score: 2 }])).toBe(0);
  });
});

describe("calculateDomainScore", () => {
  it("weights by importanceScore and skips capabilities missing either side", () => {
    const capabilities = [
      {
        id: "c1",
        name: "Fully Assessed",
        importanceScore: 10,
        asIs: [{ locationTag: null, score: 2 }],
        toBe: [{ locationTag: null, score: 4 }],
      },
      {
        id: "c2",
        name: "Only As-Is",
        importanceScore: 5,
        asIs: [{ locationTag: null, score: 3 }],
        toBe: [],
      },
    ];

    const result = calculateDomainScore(capabilities);

    expect(result.capabilities).toHaveLength(2);
    expect(result.capabilities[0]).toMatchObject({ id: "c1", asIsScore: 2, toBeScore: 4, gapScore: 2 });
    expect(result.capabilities[1]).toMatchObject({ id: "c2", asIsScore: 3, toBeScore: null, gapScore: null });
    // Only c1 is fully scored, so domain averages come from c1 alone
    expect(result.averageAsIs).toBe(2);
    expect(result.averageToBe).toBe(4);
    expect(result.averageGap).toBe(2);
  });

  it("returns zeros when no capability has both sides scored", () => {
    const result = calculateDomainScore([
      { id: "c1", name: "Unscored", importanceScore: 5, asIs: [], toBe: [] },
    ]);
    expect(result.averageAsIs).toBe(0);
    expect(result.averageToBe).toBe(0);
    expect(result.averageGap).toBe(0);
  });
});
```

Create `tests/schema/maturity-target.test.ts`:

```typescript
import { afterAll, describe, expect, it } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";
import { getCurrentTargetMaturity, getCurrentTargetMaturityForOrganization } from "../../lib/maturity/target";

describe("target maturity helpers", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("returns the latest target per location, and the org-wide batched view", async () => {
    const org = await createTestOrganization({ name: "Target Maturity Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Extrusion Process Control" } });

    await prisma.targetMaturity.create({
      data: { capabilityId: capability.id, locationTag: "Brampton", score: 3, setAt: new Date("2026-01-01") },
    });
    await prisma.targetMaturity.create({
      data: { capabilityId: capability.id, locationTag: "Brampton", score: 4, setAt: new Date("2026-03-01") },
    });

    const current = await getCurrentTargetMaturity(capability.id);
    expect(current).toHaveLength(1);
    expect(current[0].score).toBe(4);

    const orgWide = await getCurrentTargetMaturityForOrganization(org.id);
    expect(orgWide).toHaveLength(1);
    expect(orgWide[0]).toMatchObject({ capabilityId: capability.id, locationTag: "Brampton", score: 4 });
  });

  it("returns an empty array when a capability has no targets", async () => {
    const org = await createTestOrganization({ name: "No Target Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Untouched" } });

    expect(await getCurrentTargetMaturity(capability.id)).toEqual([]);
  });
});
```

Create `tests/schema/clients-route.test.ts`:

```typescript
import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "test-user", email: "advisor@test.com" } } }) },
  }),
}));

import { GET as getClient } from "../../app/api/clients/[id]/route";

describe("GET /api/clients/[id]", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("embeds currentAsIs and currentToBe per capability", async () => {
    const org = await createTestOrganization({ name: "Clients Route Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });

    await prisma.maturityAssessment.create({
      data: { capabilityId: capability.id, locationTag: "Alexandria", score: 2 },
    });
    await prisma.targetMaturity.create({
      data: { capabilityId: capability.id, locationTag: null, score: 4 },
    });

    const res = await getClient(new Request("http://localhost/api/clients/" + org.id) as never, {
      params: Promise.resolve({ id: org.id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    const cap = body.domains[0].capabilities[0];
    expect(cap.currentAsIs).toEqual([{ locationTag: "Alexandria", score: 2 }]);
    expect(cap.currentToBe).toEqual([{ locationTag: null, score: 4 }]);
  });

  it("returns empty arrays for a capability with no assessments", async () => {
    const org = await createTestOrganization({ name: "Clients Route Empty Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    await prisma.capability.create({ data: { domainId: domain.id, name: "Untouched" } });

    const res = await getClient(new Request("http://localhost/api/clients/" + org.id) as never, {
      params: Promise.resolve({ id: org.id }),
    });
    const body = await res.json();
    expect(body.domains[0].capabilities[0].currentAsIs).toEqual([]);
    expect(body.domains[0].capabilities[0].currentToBe).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- scoring-engine maturity-target clients-route`
Expected: FAIL — `lib/maturity/target.ts` doesn't exist, `averageScore`/new `calculateGap`/`calculateDomainScore` signatures don't exist yet, `GET /api/clients/[id]` doesn't return `currentAsIs`/`currentToBe`.

- [ ] **Step 3: Add the org-wide helper to `lib/maturity/current.ts`**

Append to the existing file (do not modify `getCurrentMaturity` or `CurrentMaturity`):

```typescript
export type OrgCurrentMaturity = {
  capabilityId: string;
  locationTag: string | null;
  score: number;
};

export async function getCurrentMaturityForOrganization(organizationId: string): Promise<OrgCurrentMaturity[]> {
  const rows = await prisma.maturityAssessment.findMany({
    where: { capability: { domain: { organizationId } } },
    orderBy: { assessedAt: "desc" },
    distinct: ["capabilityId", "locationTag"],
  });

  return rows.map((row) => ({
    capabilityId: row.capabilityId,
    locationTag: row.locationTag,
    score: row.score,
  }));
}
```

- [ ] **Step 4: Create `lib/maturity/target.ts`**

```typescript
import { prisma } from "@/lib/db";
import type { OrgCurrentMaturity } from "./current";

export type CurrentMaturity = {
  locationTag: string | null;
  score: number;
  setAt: Date;
};

export async function getCurrentTargetMaturity(capabilityId: string): Promise<CurrentMaturity[]> {
  const rows = await prisma.targetMaturity.findMany({
    where: { capabilityId },
    orderBy: { setAt: "desc" },
  });

  const latestByLocation = new Map<string | null, CurrentMaturity>();
  for (const row of rows) {
    if (!latestByLocation.has(row.locationTag)) {
      latestByLocation.set(row.locationTag, {
        locationTag: row.locationTag,
        score: row.score,
        setAt: row.setAt,
      });
    }
  }

  return Array.from(latestByLocation.values());
}

export async function getCurrentTargetMaturityForOrganization(organizationId: string): Promise<OrgCurrentMaturity[]> {
  const rows = await prisma.targetMaturity.findMany({
    where: { capability: { domain: { organizationId } } },
    orderBy: { setAt: "desc" },
    distinct: ["capabilityId", "locationTag"],
  });

  return rows.map((row) => ({
    capabilityId: row.capabilityId,
    locationTag: row.locationTag,
    score: row.score,
  }));
}
```

- [ ] **Step 5: Rewrite `lib/scoring/engine.ts`**

Replace the full file:

```typescript
export type MaturitySnapshot = {
  locationTag: string | null;
  score: number;
};

export type CapabilityMaturity = {
  id: string;
  name: string;
  importanceScore: number | null;
  asIs: MaturitySnapshot[];
  toBe: MaturitySnapshot[];
};

export type CapabilityScore = {
  id: string;
  name: string;
  asIsScore: number | null;
  toBeScore: number | null;
  importanceScore: number | null;
  gapScore: number | null;
};

export type DomainScore = {
  id: string;
  name: string;
  color: string | null;
  averageAsIs: number;
  averageToBe: number;
  averageGap: number;
  capabilities: CapabilityScore[];
};

export function averageScore(snapshots: MaturitySnapshot[]): number | null {
  if (snapshots.length === 0) return null;
  const sum = snapshots.reduce((acc, s) => acc + s.score, 0);
  return Math.round((sum / snapshots.length) * 10) / 10;
}

export function calculateGap(asIs: MaturitySnapshot[], toBe: MaturitySnapshot[]): number | null {
  if (asIs.length === 0 || toBe.length === 0) return null;

  const toBeByLocation = new Map(toBe.map((t) => [t.locationTag, t.score]));
  const orgWideToBe = toBeByLocation.get(null);

  // Match each as-is location's target: same location first, else org-wide fallback.
  const matchedToBeScores: number[] = [];
  for (const a of asIs) {
    const matched = toBeByLocation.has(a.locationTag) ? toBeByLocation.get(a.locationTag)! : orgWideToBe;
    if (matched != null) matchedToBeScores.push(matched);
  }

  const asIsAvg = averageScore(asIs);
  const toBeAvg =
    matchedToBeScores.length > 0
      ? matchedToBeScores.reduce((a, b) => a + b, 0) / matchedToBeScores.length
      : averageScore(toBe);

  if (asIsAvg == null || toBeAvg == null) return null;
  return Math.max(0, Math.round((toBeAvg - asIsAvg) * 10) / 10);
}

export function calculateDomainScore(capabilities: CapabilityMaturity[]): {
  averageAsIs: number;
  averageToBe: number;
  averageGap: number;
  capabilities: CapabilityScore[];
} {
  const scores: CapabilityScore[] = capabilities.map((c) => ({
    id: c.id,
    name: c.name,
    importanceScore: c.importanceScore,
    asIsScore: averageScore(c.asIs),
    toBeScore: averageScore(c.toBe),
    gapScore: calculateGap(c.asIs, c.toBe),
  }));

  const scored = scores.filter((c) => c.asIsScore != null && c.toBeScore != null);
  if (scored.length === 0) {
    return { averageAsIs: 0, averageToBe: 0, averageGap: 0, capabilities: scores };
  }

  const totalImportance = scored.reduce((sum, c) => sum + (c.importanceScore ?? 5), 0);
  const weightedAsIs = scored.reduce((sum, c) => sum + (c.asIsScore ?? 0) * (c.importanceScore ?? 5), 0);
  const weightedToBe = scored.reduce((sum, c) => sum + (c.toBeScore ?? 0) * (c.importanceScore ?? 5), 0);

  const averageAsIs = totalImportance > 0 ? weightedAsIs / totalImportance : 0;
  const averageToBe = totalImportance > 0 ? weightedToBe / totalImportance : 0;
  const averageGap = Math.max(0, averageToBe - averageAsIs);

  return {
    averageAsIs: Math.round(averageAsIs * 10) / 10,
    averageToBe: Math.round(averageToBe * 10) / 10,
    averageGap: Math.round(averageGap * 10) / 10,
    capabilities: scores,
  };
}

export function buildRadarData(domains: DomainScore[]) {
  return domains.map((d) => ({
    domain: d.name,
    "As-Is": d.averageAsIs,
    "To-Be": d.averageToBe,
    gap: d.averageGap,
  }));
}

export function getGapSeverity(gap: number | null): "none" | "low" | "medium" | "high" | "critical" {
  if (gap == null) return "none";
  if (gap <= 1) return "low";
  if (gap <= 2) return "medium";
  if (gap <= 3) return "high";
  return "critical";
}

export function getGapColor(severity: ReturnType<typeof getGapSeverity>): string {
  const colors = {
    none: "#e5e7eb",
    low: "#bbf7d0",
    medium: "#fef08a",
    high: "#fca5a5",
    critical: "#f87171",
  };
  return colors[severity];
}

export function getOverallMaturity(domains: DomainScore[]): number {
  const scored = domains.filter((d) => d.averageAsIs > 0);
  if (scored.length === 0) return 0;
  const avg = scored.reduce((sum, d) => sum + d.averageAsIs, 0) / scored.length;
  return Math.round(avg * 10) / 10;
}
```

- [ ] **Step 6: Wire `currentAsIs`/`currentToBe` into `GET /api/clients/[id]`**

Replace the full file `app/api/clients/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMaturityForOrganization } from "@/lib/maturity/current";
import { getCurrentTargetMaturityForOrganization } from "@/lib/maturity/target";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      domains: {
        orderBy: { order: "asc" },
        include: {
          capabilities: { orderBy: { order: "asc" } },
        },
      },
      stakeholders: { orderBy: { name: "asc" } },
      kpis: { orderBy: { name: "asc" } },
      achievements: { orderBy: { priority: "desc" } },
      sessions: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [currentAsIs, currentToBe] = await Promise.all([
    getCurrentMaturityForOrganization(id),
    getCurrentTargetMaturityForOrganization(id),
  ]);

  const asIsByCapability = new Map<string, { locationTag: string | null; score: number }[]>();
  for (const row of currentAsIs) {
    const list = asIsByCapability.get(row.capabilityId) ?? [];
    list.push({ locationTag: row.locationTag, score: row.score });
    asIsByCapability.set(row.capabilityId, list);
  }
  const toBeByCapability = new Map<string, { locationTag: string | null; score: number }[]>();
  for (const row of currentToBe) {
    const list = toBeByCapability.get(row.capabilityId) ?? [];
    list.push({ locationTag: row.locationTag, score: row.score });
    toBeByCapability.set(row.capabilityId, list);
  }

  const enriched = {
    ...org,
    domains: org.domains.map((domain) => ({
      ...domain,
      capabilities: domain.capabilities.map((cap) => ({
        ...cap,
        currentAsIs: asIsByCapability.get(cap.id) ?? [],
        currentToBe: toBeByCapability.get(cap.id) ?? [],
      })),
    })),
  };

  return NextResponse.json(enriched);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const org = await prisma.organization.update({
    where: { id },
    data: {
      name: body.name,
      industry: body.industry,
      size: body.size,
      notes: body.notes,
    },
  });

  return NextResponse.json(org);
}
```

(This `PATCH` stays unchanged — `engagementMotive` is added to it in Task 6.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- scoring-engine maturity-target clients-route`
Expected: PASS (all cases).

- [ ] **Step 8: Commit**

```bash
git add lib/maturity lib/scoring/engine.ts app/api/clients tests/unit/scoring-engine.test.ts tests/schema/maturity-target.test.ts tests/schema/clients-route.test.ts
git commit -m "Rewrite scoring engine and current-maturity helpers for snapshot-based, location-aware gap computation"
```

---

