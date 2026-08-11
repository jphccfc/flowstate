# Flow State Phase 3a: Assessment Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy 0–10 slider-based `Capability.asIsScore`/`toBeScore` assessment flow with a versioned, location-aware maturity model (0–5 scale): as-is scores via the existing `MaturityAssessment` model, to-be targets via a new `TargetMaturity` model, both with Claude-assisted drafting, feeding rewritten assess/analysis/report pages.

**Architecture:** Two new small "current value" lib helpers (`lib/maturity/current.ts` extended, `lib/maturity/target.ts` new) read the latest assessment/target per capability+location straight from Postgres via `distinct`+`orderBy`. `lib/scoring/engine.ts` is rewritten to compute gaps and domain aggregates from those snapshots instead of flat `Capability` fields. New API routes create as-is/to-be entries and serve AI-assisted drafts (raw `fetch` to Claude, matching the existing `lib/ai/*` pattern). Three existing pages are fully rewritten against the new data; two existing routes get small compile-safety fixes for the `Capability` field drop.

**Tech Stack:** Next.js 16 App Router, Prisma 7 (`prisma-client` generator), Supabase Postgres, Vitest against the real DB (no DB mocks), raw-`fetch` Claude calls (no SDK).

## Global Constraints

- `MaturityAssessment`/`TargetMaturity` scores are **integers 0–5**. API routes reject non-integer or out-of-range scores with 400.
- `TargetMaturity` is a **separate model** from `MaturityAssessment` (not a shared model with a type discriminator) — see spec §3.
- Capability-level `tags: String[]` is **free-form**, not curated. Applied to `Capability` only — never to `MaturityAssessment`/`TargetMaturity` rows.
- Gap computation: for each as-is location, match a to-be entry at the same `locationTag`; if none exists, fall back to the org-wide (`locationTag: null`) target.
- Domain/radar aggregation: a capability's contribution is the **average** across all its current location scores (trivially one value for org-wide-only capabilities).
- Every route follows the existing auth-check pattern: `createClient()` → `getUser()` → 401 before anything else.
- No new AI SDK — Claude calls are raw `fetch` to `https://api.anthropic.com/v1/messages`, matching `lib/ai/tagging.ts`.
- Tests are integration tests against the real Supabase Postgres DB (no DB mocks); only `fetch` (AI calls) and Supabase auth are mocked, matching every prior phase's convention.
- No seed data currently populates the `Capability` fields being dropped — the schema migration needs no backfill.

**Two deliberate refinements from the spec's literal text, found during implementation research:**
1. The spec sketches `getCurrentAsIs`/`getCurrentToBe` as `lib/scoring/engine.ts` exports. Research found `lib/maturity/current.ts` already has a working, tested `getCurrentMaturity(capabilityId)` doing exactly this (built in Phase 1, unused until now). This plan reuses it instead of reinventing it, adds its to-be counterpart in `lib/maturity/target.ts`, and keeps `lib/scoring/engine.ts` to pure functions operating on already-current snapshots (`averageScore`/`calculateGap`/`calculateDomainScore`). Same intent as the spec, different location/names for the "read latest" step.
2. The spec references `PATCH /api/organizations/[id]`. No such route exists — organization editing goes through `PATCH /api/clients/[id]` (Task 6 uses the real route).

---

## File Structure

- `prisma/schema.prisma` — modified: new `TargetMaturity` model, `Organization.engagementMotive`, `Capability` field drop + `tags`.
- `app/api/capabilities/route.ts` — modified: remove hardcoded `toBeScore: 8`.
- `app/api/capabilities/[id]/route.ts` — modified: drop removed-field references and gap computation; add `tags`.
- `app/clients/[id]/configure/page.tsx` — modified: remove the "Target score" input, add a tags input.
- `app/clients/[id]/page.tsx` — modified: "assessed capability" counts computed from `MaturityAssessment` existence instead of the dropped `asIsScore` field.
- `lib/maturity/current.ts` — modified: add `getCurrentMaturityForOrganization` (existing `getCurrentMaturity` untouched).
- `lib/maturity/target.ts` — new: `getCurrentTargetMaturity`, `getCurrentTargetMaturityForOrganization`.
- `lib/scoring/engine.ts` — modified: new snapshot-based `calculateGap`/`calculateDomainScore`, `averageScore` added, `getGapSeverity`/`getGapColor`/`buildRadarData`/`getOverallMaturity` unchanged.
- `app/api/clients/[id]/route.ts` — modified: `GET` embeds `currentAsIs`/`currentToBe` per capability; `PATCH` accepts `engagementMotive`.
- `app/api/maturity-assessments/route.ts` — new: `POST`.
- `app/api/target-maturities/route.ts` — new: `POST`.
- `app/api/capabilities/[id]/assessment-history/route.ts` — new: `GET`.
- `lib/ai/maturity-draft.ts` — new: `draftAsIsScore`, `draftToBeScore`.
- `app/api/capabilities/[id]/draft-as-is/route.ts` — new: `POST`.
- `app/api/capabilities/[id]/draft-to-be/route.ts` — new: `POST`.
- `app/clients/[id]/assess/page.tsx` — full rewrite.
- `app/clients/[id]/analysis/page.tsx` — full rewrite.
- `app/clients/[id]/report/page.tsx` — full rewrite.

---

### Task 1: Schema migration — TargetMaturity, engagementMotive, Capability cleanup

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `app/api/capabilities/route.ts`
- Modify: `app/api/capabilities/[id]/route.ts`
- Modify: `app/clients/[id]/configure/page.tsx`
- Modify: `app/clients/[id]/page.tsx`
- Migration: `prisma/migrations/<timestamp>_phase3a_target_maturity_and_capability_cleanup/`

**Interfaces:**
- Produces: `TargetMaturity` Prisma model (`id`, `capabilityId`, `locationTag`, `score`, `rationale`, `committedBy`, `source`, `sourceSegmentIds`, `setBy`, `setAt`, `createdAt`), `Organization.engagementMotive: String?`, `Capability.tags: String[]`. All later tasks depend on these existing in the generated Prisma client.

- [ ] **Step 1: Edit the schema**

In `prisma/schema.prisma`, replace the `Capability` model:

```prisma
model Capability {
  id          String   @id @default(cuid())
  domainId    String
  name        String
  aliases     String[] @default([])
  description String?
  dimensions  String[] @default([])
  metrics     String[] @default([])
  tags        String[] @default([])

  importanceScore Float? @default(5)

  order     Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  domain       BusinessDomain @relation(fields: [domainId], references: [id], onDelete: Cascade)
  stakeholders CapabilityStakeholder[]
  kpis         CapabilityKPI[]
  processes    CapabilityProcess[]
  technologies CapabilityTechnology[]
  projects     ProjectCapability[]
  maturityAssessments MaturityAssessment[]
  targetMaturities     TargetMaturity[]
  kpiCeilings          CapabilityKPIMaturityCeiling[]
  followUpSuggestions FollowUpSuggestion[]
}
```

Add `engagementMotive` to `Organization`:

```prisma
model Organization {
  id        String   @id @default(cuid())
  name      String
  industry  String?
  size      String?
  notes     String?
  engagementMotive String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  users        UserOrganization[]
  domains      BusinessDomain[]
  stakeholders Stakeholder[]
  kpis         KPI[]
  achievements Achievement[]
  technologies Technology[]
  processes    Process[]
  projects     Project[]
  sessions       AssessmentSession[]
  capturedInputs CapturedInput[]
  recommendations Recommendation[]
}
```

Add the new `TargetMaturity` model directly below `model MaturityAssessment { ... }`:

```prisma
model TargetMaturity {
  id                String   @id @default(cuid())
  capabilityId      String
  locationTag       String?
  score             Int
  rationale         String?
  committedBy       String?
  source            String   @default("manual")
  sourceSegmentIds  String[] @default([])
  setBy             String?
  setAt             DateTime @default(now())
  createdAt         DateTime @default(now())

  capability Capability @relation(fields: [capabilityId], references: [id], onDelete: Cascade)

  @@index([capabilityId, locationTag, setAt])
}
```

- [ ] **Step 2: Generate and apply the migration**

Run: `npx prisma migrate dev --name phase3a_target_maturity_and_capability_cleanup`
Expected: migration created and applied against `DIRECT_URL` cleanly (no data-loss prompts beyond dropping the 8 `Capability` columns, which is expected and safe — no seed data populates them). Prisma client regenerates automatically.

- [ ] **Step 3: Fix `app/api/capabilities/route.ts`**

Replace its `POST` handler body — remove the now-nonexistent `toBeScore` field:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { domainId, name, description, dimensions, metrics, aliases, tags, order } = body;

  const capability = await prisma.capability.create({
    data: {
      domainId,
      name,
      description,
      dimensions: dimensions ?? [],
      metrics: metrics ?? [],
      aliases: aliases ?? [],
      tags: tags ?? [],
      order: order ?? 0,
      importanceScore: 5,
    },
  });

  return NextResponse.json(capability, { status: 201 });
}
```

- [ ] **Step 4: Fix `app/api/capabilities/[id]/route.ts`**

Replace the full file — the `PATCH` handler drops all removed-field references and the `calculateGap` call (capability-level scoring no longer exists; scores now live in `MaturityAssessment`/`TargetMaturity`, handled by Task 3's routes):

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const capability = await prisma.capability.update({
    where: { id },
    data: {
      name: body.name,
      description: body.description,
      aliases: body.aliases,
      dimensions: body.dimensions,
      metrics: body.metrics,
      tags: body.tags,
      importanceScore: body.importanceScore,
      order: body.order,
    },
  });

  return NextResponse.json(capability);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.capability.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Fix `app/clients/[id]/configure/page.tsx`**

Update the `Capability` type near the top of the file — replace:

```typescript
type Capability = {
  id: string;
  name: string;
  description: string | null;
  aliases: string[];
  dimensions: string[];
  metrics: string[];
  importanceScore: number | null;
  toBeScore: number | null;
  order: number;
};
```

with:

```typescript
type Capability = {
  id: string;
  name: string;
  description: string | null;
  aliases: string[];
  dimensions: string[];
  metrics: string[];
  tags: string[];
  importanceScore: number | null;
  order: number;
};
```

Then find the capability row block (inside the expanded-domain view, the `<div className="flex items-center gap-3 mt-2">` containing the "Target score" and "Importance" inputs) and replace it — remove the "Target score" input, keep "Importance", add a comma-separated tags input:

```tsx
                              <div className="flex items-center gap-3 mt-2">
                                <label className="text-xs text-[var(--muted)]">Importance:</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={cap.importanceScore ?? 5}
                                  onChange={(e) => updateCapabilityField(cap.id, "importanceScore", parseFloat(e.target.value))}
                                  className="w-16 px-2 py-0.5 border border-[var(--card-border)] rounded text-xs text-center focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                                />
                                <label className="text-xs text-[var(--muted)]">Tags:</label>
                                <input
                                  type="text"
                                  defaultValue={cap.tags?.join(", ") ?? ""}
                                  onBlur={(e) =>
                                    updateCapabilityField(
                                      cap.id,
                                      "tags",
                                      e.target.value.split(",").map((t) => t.trim()).filter(Boolean)
                                    )
                                  }
                                  placeholder="Strength, Culture, Legal..."
                                  className="flex-1 px-2 py-0.5 border border-[var(--card-border)] rounded text-xs focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                                />
                              </div>
```

- [ ] **Step 6: Fix `app/clients/[id]/page.tsx`**

This server component computes "assessed capability" counts directly from `c.asIsScore != null` via a raw Prisma query — it doesn't go through `GET /api/clients/[id]`, so it needs its own fix independent of Task 2's helpers (which don't exist yet at this point in the plan). Replace the full file:

```tsx
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function ClientOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      domains: {
        include: { capabilities: true },
        orderBy: { order: "asc" },
      },
      sessions: { orderBy: { createdAt: "desc" }, take: 3 },
      _count: { select: { kpis: true, achievements: true, stakeholders: true } },
    },
  });

  if (!org) notFound();

  const assessedRows = await prisma.maturityAssessment.findMany({
    where: { capability: { domain: { organizationId: id } } },
    distinct: ["capabilityId"],
    select: { capabilityId: true },
  });
  const assessedCapabilityIds = new Set(assessedRows.map((r) => r.capabilityId));

  const totalCapabilities = org.domains.reduce((sum, d) => sum + d.capabilities.length, 0);
  const assessedCapabilities = org.domains.reduce(
    (sum, d) => sum + d.capabilities.filter((c) => assessedCapabilityIds.has(c.id)).length,
    0
  );

  const cards = [
    { href: `/clients/${id}/configure`, label: "Configure", icon: "⚙️", desc: "Set up domains, capabilities, KPIs, and target achievements", cta: "Configure" },
    { href: `/clients/${id}/assess`, label: "Assess", icon: "📋", desc: "Run a live capability assessment interview", cta: "Start / Continue Assessment" },
    { href: `/clients/${id}/analysis`, label: "Analysis", icon: "📊", desc: "View gap analysis, radar charts, and capability heatmaps", cta: "View Analysis" },
    { href: `/clients/${id}/report`, label: "Report", icon: "📄", desc: "Generate an executive summary and growth plan", cta: "View Report" },
  ];

  return (
    <main className="max-w-5xl mx-auto w-full px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{org.name}</h1>
        <div className="flex items-center gap-3 mt-1 text-sm text-[var(--muted)]">
          {org.industry && <span>{org.industry}</span>}
          {org.size && <><span>·</span><span>{org.size}</span></>}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Domains", value: org.domains.length },
          { label: "Capabilities", value: totalCapabilities },
          { label: "Assessed", value: `${assessedCapabilities}/${totalCapabilities}` },
          { label: "KPIs", value: org._count.kpis },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-[var(--card-border)] p-4">
            <div className="text-2xl font-bold text-[var(--primary)]">{stat.value}</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="bg-white rounded-xl border border-[var(--card-border)] p-6 hover:shadow-md transition-all hover:border-[var(--accent)] group"
          >
            <div className="text-3xl mb-3">{card.icon}</div>
            <div className="font-semibold text-[var(--foreground)] mb-1">{card.label}</div>
            <div className="text-sm text-[var(--muted)] mb-3">{card.desc}</div>
            <div className="text-sm font-medium text-[var(--accent)] group-hover:underline">{card.cta} →</div>
          </Link>
        ))}
      </div>

      {org.domains.length > 0 && (
        <div className="bg-white rounded-xl border border-[var(--card-border)] p-6">
          <h2 className="font-semibold text-[var(--foreground)] mb-4">Domains Overview</h2>
          <div className="space-y-2">
            {org.domains.map((domain) => {
              const assessed = domain.capabilities.filter((c) => assessedCapabilityIds.has(c.id)).length;
              const pct = domain.capabilities.length > 0
                ? Math.round((assessed / domain.capabilities.length) * 100)
                : 0;
              return (
                <div key={domain.id} className="flex items-center gap-3">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: domain.color ?? "#94a3b8" }}
                  />
                  <span className="text-sm text-[var(--foreground)] flex-1 min-w-0 truncate">
                    {domain.name}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    {assessed}/{domain.capabilities.length} assessed
                  </span>
                  <div className="w-24 h-1.5 rounded-full bg-[var(--muted-bg)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--accent)]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 7: Verify the build**

Run: `npm run build`
Expected: succeeds with no type errors referencing the dropped `Capability` fields.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations app/api/capabilities app/clients/\[id\]/configure/page.tsx app/clients/\[id\]/page.tsx
git commit -m "Migrate Capability to versioned maturity model: add TargetMaturity, engagementMotive, tags; drop legacy score fields"
```

---

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

### Task 5: Claude-assisted as-is/to-be drafting

**Files:**
- Create: `lib/ai/maturity-draft.ts`
- Create: `app/api/capabilities/[id]/draft-as-is/route.ts`
- Create: `app/api/capabilities/[id]/draft-to-be/route.ts`
- Test: `tests/schema/maturity-draft-generator.test.ts`
- Test: `tests/schema/maturity-draft-routes.test.ts`

**Interfaces:**
- Produces: `draftAsIsScore(capabilityName: string, evidenceTexts: string[]): Promise<{ score: number; evidence: string }>`, `draftToBeScore(capabilityName: string, engagementMotive: string | null, kpiTargets: string[]): Promise<{ score: number; rationale: string }>` from `lib/ai/maturity-draft.ts`. `POST /api/capabilities/[id]/draft-as-is` (body `{ locationTag? }`, returns `{ score, evidence }`), `POST /api/capabilities/[id]/draft-to-be` (no body needed, returns `{ score, rationale }`) — Task 7 (assess page) calls both.

- [ ] **Step 1: Write the failing tests**

Create `tests/schema/maturity-draft-generator.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { draftAsIsScore, draftToBeScore } from "../../lib/ai/maturity-draft";

describe("draftAsIsScore", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("parses a score and evidence from the Claude response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ content: [{ text: JSON.stringify({ score: 2, evidence: "Manual, ad hoc process." }) }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await draftAsIsScore("Shift Scheduling", ["We schedule shifts on a whiteboard."]);
    expect(result).toEqual({ score: 2, evidence: "Manual, ad hoc process." });
    expect(mockFetch).toHaveBeenCalledWith("https://api.anthropic.com/v1/messages", expect.objectContaining({ method: "POST" }));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain("We schedule shifts on a whiteboard.");
  });

  it("clamps an out-of-range score into 0-5", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ content: [{ text: JSON.stringify({ score: 9, evidence: "x" }) }] }) }));
    const result = await draftAsIsScore("X", []);
    expect(result.score).toBe(5);
  });

  it("returns score 0 and empty evidence on unparseable response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ content: [{ text: "not json" }] }) }));
    expect(await draftAsIsScore("X", [])).toEqual({ score: 0, evidence: "" });
  });
});

describe("draftToBeScore", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("includes engagement motive and KPI targets in the prompt", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ content: [{ text: JSON.stringify({ score: 4, rationale: "Growth target." }) }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await draftToBeScore("Shift Scheduling", "Growth", ["On-time delivery: 95%"]);
    expect(result).toEqual({ score: 4, rationale: "Growth target." });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain("Growth");
    expect(body.messages[0].content).toContain("On-time delivery: 95%");
  });

  it("returns score 0 and empty rationale on unparseable response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ content: [{ text: "not json" }] }) }));
    expect(await draftToBeScore("X", null, [])).toEqual({ score: 0, rationale: "" });
  });
});
```

Create `tests/schema/maturity-draft-routes.test.ts`:

```typescript
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "test-user", email: "advisor@test.com" } } }) },
  }),
}));

import { POST as draftAsIs } from "../../app/api/capabilities/[id]/draft-as-is/route";
import { POST as draftToBe } from "../../app/api/capabilities/[id]/draft-to-be/route";

describe("draft routes", () => {
  let orgId: string;

  afterEach(() => vi.unstubAllGlobals());

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("draft-as-is gathers approved tag evidence for the capability and returns a draft", async () => {
    const org = await createTestOrganization({ name: "Draft AsIs Test Org" });
    orgId = org.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });

    const input = await prisma.capturedInput.create({
      data: { organizationId: org.id, type: "TEXT_NOTE", rawText: "Night shift scheduling is a mess.", status: "TAGGED" },
    });
    const segment = await prisma.capturedSegment.create({
      data: { capturedInputId: input.id, order: 0, text: "Night shift scheduling is a mess." },
    });
    await prisma.tag.create({
      data: { segmentId: segment.id, targetType: "CAPABILITY", targetId: capability.id, confidence: 0.9, status: "AUTO_APPROVED" },
    });
    // A PENDING_REVIEW tag on the same capability should be excluded
    const segment2 = await prisma.capturedSegment.create({
      data: { capturedInputId: input.id, order: 1, text: "Unreviewed claim." },
    });
    await prisma.tag.create({
      data: { segmentId: segment2.id, targetType: "CAPABILITY", targetId: capability.id, confidence: 0.4, status: "PENDING_REVIEW" },
    });

    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ content: [{ text: JSON.stringify({ score: 2, evidence: "Ad hoc scheduling." }) }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const res = await draftAsIs(new Request("http://localhost/api/capabilities/" + capability.id + "/draft-as-is", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }) as never, { params: Promise.resolve({ id: capability.id }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ score: 2, evidence: "Ad hoc scheduling." });

    const promptBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(promptBody.messages[0].content).toContain("Night shift scheduling is a mess.");
    expect(promptBody.messages[0].content).not.toContain("Unreviewed claim.");
  });

  it("draft-to-be includes engagementMotive and KPI targets from the capability's relations", async () => {
    const org = await createTestOrganization({ name: "Draft ToBe Test Org" });
    orgId = org.id;
    await prisma.organization.update({ where: { id: org.id }, data: { engagementMotive: "Acquisition Recovery" } });
    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });
    const kpi = await prisma.kPI.create({ data: { organizationId: org.id, name: "On-time delivery", targetValue: "95%" } });
    await prisma.capabilityKPI.create({ data: { capabilityId: capability.id, kpiId: kpi.id } });

    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ content: [{ text: JSON.stringify({ score: 4, rationale: "Deal-driven target." }) }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const res = await draftToBe(new Request("http://localhost/api/capabilities/" + capability.id + "/draft-to-be", { method: "POST" }) as never, {
      params: Promise.resolve({ id: capability.id }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ score: 4, rationale: "Deal-driven target." });

    const promptBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(promptBody.messages[0].content).toContain("Acquisition Recovery");
    expect(promptBody.messages[0].content).toContain("On-time delivery: 95%");
  });

  it("404s for a nonexistent capability on both routes", async () => {
    const resA = await draftAsIs(new Request("http://localhost/x", { method: "POST", body: "{}" }) as never, {
      params: Promise.resolve({ id: "does-not-exist" }),
    });
    expect(resA.status).toBe(404);

    const resB = await draftToBe(new Request("http://localhost/x", { method: "POST" }) as never, {
      params: Promise.resolve({ id: "does-not-exist" }),
    });
    expect(resB.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- maturity-draft-generator maturity-draft-routes`
Expected: FAIL — `lib/ai/maturity-draft.ts` and both routes don't exist.

- [ ] **Step 3: Create `lib/ai/maturity-draft.ts`**

```typescript
export async function draftAsIsScore(
  capabilityName: string,
  evidenceTexts: string[]
): Promise<{ score: number; evidence: string }> {
  const evidenceList =
    evidenceTexts.length > 0 ? evidenceTexts.map((t, i) => `${i + 1}. ${t}`).join("\n") : "(no evidence captured yet)";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `You are drafting a current-state (as-is) maturity score for a business capability, on a 0-5 scale (0 = does not exist / entirely ad hoc, 5 = best-in-class, fully optimized and measured).

Capability: "${capabilityName}"

Evidence gathered from interviews/documents:
${evidenceList}

Return a JSON object with exactly these fields: score (integer 0-5), evidence (a short 1-3 sentence summary of why, grounded in the evidence above). If there's no evidence, return score 0 and evidence explaining nothing has been captured yet.`,
        },
      ],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text ?? "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { score: 0, evidence: "" };

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const score = Math.max(0, Math.min(5, Math.round(Number(parsed.score) || 0)));
    return { score, evidence: typeof parsed.evidence === "string" ? parsed.evidence : "" };
  } catch {
    return { score: 0, evidence: "" };
  }
}

export async function draftToBeScore(
  capabilityName: string,
  engagementMotive: string | null,
  kpiTargets: string[]
): Promise<{ score: number; rationale: string }> {
  const motiveText = engagementMotive ?? "(not specified)";
  const kpiList = kpiTargets.length > 0 ? kpiTargets.join("\n") : "(no KPI targets captured yet)";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `You are drafting a target (to-be) maturity score for a business capability, on a 0-5 scale (0 = does not exist, 5 = best-in-class). This is a suggested starting point for a stakeholder to confirm or override — not a final answer.

Capability: "${capabilityName}"
Engagement motive: ${motiveText}
Related KPI targets: ${kpiList}

Return a JSON object with exactly these fields: score (integer 0-5), rationale (a short 1-2 sentence justification referencing the engagement motive and/or KPI targets where relevant).`,
        },
      ],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text ?? "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { score: 0, rationale: "" };

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const score = Math.max(0, Math.min(5, Math.round(Number(parsed.score) || 0)));
    return { score, rationale: typeof parsed.rationale === "string" ? parsed.rationale : "" };
  } catch {
    return { score: 0, rationale: "" };
  }
}
```

- [ ] **Step 4: Create `app/api/capabilities/[id]/draft-as-is/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { draftAsIsScore } from "@/lib/ai/maturity-draft";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const locationTag: string | null = body.locationTag ?? null;

  const capability = await prisma.capability.findUnique({ where: { id } });
  if (!capability) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tags = await prisma.tag.findMany({
    where: {
      targetType: "CAPABILITY",
      targetId: id,
      status: { in: ["AUTO_APPROVED", "APPROVED"] },
      ...(locationTag ? { segment: { capturedInput: { locationTag } } } : {}),
    },
    include: { segment: true },
  });

  const evidenceTexts = tags.map((t) => t.segment.text);
  const draft = await draftAsIsScore(capability.name, evidenceTexts);

  return NextResponse.json(draft);
}
```

- [ ] **Step 5: Create `app/api/capabilities/[id]/draft-to-be/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { draftToBeScore } from "@/lib/ai/maturity-draft";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const capability = await prisma.capability.findUnique({
    where: { id },
    include: { domain: { include: { organization: true } }, kpis: { include: { kpi: true } } },
  });
  if (!capability) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const kpiTargets = capability.kpis
    .map((ck) => ck.kpi)
    .filter((kpi) => kpi.targetValue)
    .map((kpi) => `${kpi.name}: ${kpi.targetValue}`);

  const draft = await draftToBeScore(capability.name, capability.domain.organization.engagementMotive, kpiTargets);

  return NextResponse.json(draft);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- maturity-draft-generator maturity-draft-routes`
Expected: PASS (all cases).

- [ ] **Step 7: Commit**

```bash
git add lib/ai/maturity-draft.ts app/api/capabilities/\[id\]/draft-as-is app/api/capabilities/\[id\]/draft-to-be tests/schema/maturity-draft-generator.test.ts tests/schema/maturity-draft-routes.test.ts
git commit -m "Add Claude-assisted as-is/to-be maturity score drafting"
```

---

### Task 6: Engagement motive on the client route

**Files:**
- Modify: `app/api/clients/[id]/route.ts` (`PATCH` only)
- Modify: `tests/schema/clients-route.test.ts` (adds `PATCH` coverage to Task 2's file)

**Interfaces:**
- Produces: `PATCH /api/clients/[id]` now accepts `engagementMotive` — Task 7's assess page (to-be drafting context) and a small settings affordance surface it, though no dedicated settings UI is required by this plan; the configure page already PATCHes this route pattern for other org fields historically, so no new page is required — `PATCH` support is sufficient for this plan's scope.

- [ ] **Step 1: Write the failing test**

Append to `tests/schema/clients-route.test.ts` (inside the existing `describe` block, after the two `GET` tests — add the `PATCH` import to the top-level import line and a new `it`):

Change the import line:
```typescript
import { GET as getClient, PATCH as patchClient } from "../../app/api/clients/[id]/route";
```

Add this test at the end of the `describe("GET /api/clients/[id]", ...)` block (rename the describe to `"clients/[id] route"` for clarity is optional; keep tests additive):

```typescript
  it("PATCH updates engagementMotive", async () => {
    const org = await createTestOrganization({ name: "Engagement Motive Test Org" });
    orgId = org.id;

    const res = await patchClient(
      new Request("http://localhost/api/clients/" + org.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engagementMotive: "Liquidation" }),
      }) as never,
      { params: Promise.resolve({ id: org.id }) }
    );
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.engagementMotive).toBe("Liquidation");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- clients-route`
Expected: FAIL — `patchClient` import fails or `engagementMotive` isn't persisted (existing `PATCH` doesn't include it).

- [ ] **Step 3: Update the `PATCH` handler**

In `app/api/clients/[id]/route.ts`, update the `PATCH` function's `data` object:

```typescript
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
      engagementMotive: body.engagementMotive,
    },
  });

  return NextResponse.json(org);
}
```

(The `GET` handler and its surrounding imports stay exactly as Task 2 left them.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- clients-route`
Expected: PASS (all cases in the file).

- [ ] **Step 5: Commit**

```bash
git add app/api/clients tests/schema/clients-route.test.ts
git commit -m "Accept engagementMotive on PATCH /api/clients/[id]"
```

---

### Task 7: Assess page rewrite

**Files:**
- Modify (full rewrite): `app/clients/[id]/assess/page.tsx`

**Interfaces:**
- Consumes: `GET /api/clients/[id]` (`currentAsIs`/`currentToBe` per capability, Task 2), `GET /api/capabilities/[id]/assessment-history` (Task 4), `POST /api/maturity-assessments`/`POST /api/target-maturities` (Task 3), `POST /api/capabilities/[id]/draft-as-is`/`draft-to-be` (Task 5), `calculateGap`/`getGapSeverity`/`getGapColor` (`lib/scoring/engine.ts`, Task 2).
- Produces: nothing consumed by later tasks — leaf UI page.

- [ ] **Step 1: Write the page**

Replace the full contents of `app/clients/[id]/assess/page.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { calculateGap, getGapSeverity, getGapColor, type MaturitySnapshot } from "@/lib/scoring/engine";

type Capability = {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  currentAsIs: MaturitySnapshot[];
  currentToBe: MaturitySnapshot[];
};

type Domain = {
  id: string;
  name: string;
  color: string | null;
  capabilities: Capability[];
};

type Org = { id: string; name: string; domains: Domain[] };

type HistoryEntry = { locationTag: string | null; score: number; evidence?: string | null; rationale?: string | null; assessedAt?: string; setAt?: string };
type HistoryData = {
  currentAsIs: MaturitySnapshot[];
  currentToBe: MaturitySnapshot[];
  asIsHistory: HistoryEntry[];
  toBeHistory: HistoryEntry[];
};

function ScorePicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[0, 1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`w-8 h-8 rounded-lg text-sm font-bold border transition-colors ${
            value === n
              ? "bg-[var(--accent)] text-white border-[var(--accent)]"
              : "border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--accent)]"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function EntryForm({
  kind,
  onSubmit,
  onDraft,
}: {
  kind: "asIs" | "toBe";
  onSubmit: (data: { locationTag: string | null; score: number; text: string; committedBy?: string }) => Promise<void>;
  onDraft: () => Promise<{ score: number; text: string }>;
}) {
  const [locationTag, setLocationTag] = useState("");
  const [score, setScore] = useState(0);
  const [text, setText] = useState("");
  const [committedBy, setCommittedBy] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleDraft() {
    setDrafting(true);
    try {
      const draft = await onDraft();
      setScore(draft.score);
      setText(draft.text);
    } finally {
      setDrafting(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await onSubmit({ locationTag: locationTag.trim() || null, score, text, committedBy: committedBy.trim() || undefined });
      setLocationTag("");
      setText("");
      setCommittedBy("");
      setScore(0);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-xs text-[var(--muted)] block mb-1">Location (blank = org-wide)</label>
          <input
            value={locationTag}
            onChange={(e) => setLocationTag(e.target.value)}
            placeholder="e.g. Alexandria, Brampton"
            className="w-full px-2 py-1.5 border border-[var(--card-border)] rounded-lg text-sm"
          />
        </div>
        {kind === "toBe" && (
          <div className="flex-1">
            <label className="text-xs text-[var(--muted)] block mb-1">Committed by</label>
            <input
              value={committedBy}
              onChange={(e) => setCommittedBy(e.target.value)}
              placeholder="e.g. CFO, advisor (provisional)"
              className="w-full px-2 py-1.5 border border-[var(--card-border)] rounded-lg text-sm"
            />
          </div>
        )}
      </div>
      <div>
        <label className="text-xs text-[var(--muted)] block mb-1">Score (0-5)</label>
        <ScorePicker value={score} onChange={setScore} />
      </div>
      <div>
        <label className="text-xs text-[var(--muted)] block mb-1">{kind === "asIs" ? "Evidence" : "Rationale"}</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          className="w-full px-2 py-1.5 border border-[var(--card-border)] rounded-lg text-sm resize-none"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-3 py-1.5 bg-[var(--accent)] text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Save"}
        </button>
        <button
          onClick={handleDraft}
          disabled={drafting}
          className="px-3 py-1.5 bg-[var(--muted-bg)] text-[var(--muted)] rounded-lg text-sm disabled:opacity-50"
        >
          {drafting ? "Drafting..." : "Draft with AI"}
        </button>
      </div>
    </div>
  );
}

export default function AssessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [org, setOrg] = useState<Org | null>(null);
  const [selectedCapId, setSelectedCapId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [showAsIsHistory, setShowAsIsHistory] = useState(false);
  const [showToBeHistory, setShowToBeHistory] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadOrg = useCallback(async () => {
    const res = await fetch(`/api/clients/${id}`);
    const data: Org = await res.json();
    setOrg(data);
    setLoading(false);
    return data;
  }, [id]);

  useEffect(() => {
    loadOrg().then((data) => {
      if (data.domains?.[0]?.capabilities?.[0]) {
        setSelectedCapId(data.domains[0].capabilities[0].id);
      }
    });
  }, [loadOrg]);

  const loadHistory = useCallback(async (capId: string) => {
    const res = await fetch(`/api/capabilities/${capId}/assessment-history`);
    setHistory(await res.json());
  }, []);

  useEffect(() => {
    if (selectedCapId) loadHistory(selectedCapId);
  }, [selectedCapId, loadHistory]);

  async function saveAsIs(data: { locationTag: string | null; score: number; text: string }) {
    if (!selectedCapId) return;
    await fetch("/api/maturity-assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capabilityId: selectedCapId, locationTag: data.locationTag, score: data.score, evidence: data.text }),
    });
    await loadHistory(selectedCapId);
    await loadOrg();
  }

  async function saveToBe(data: { locationTag: string | null; score: number; text: string; committedBy?: string }) {
    if (!selectedCapId) return;
    await fetch("/api/target-maturities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        capabilityId: selectedCapId,
        locationTag: data.locationTag,
        score: data.score,
        rationale: data.text,
        committedBy: data.committedBy,
      }),
    });
    await loadHistory(selectedCapId);
    await loadOrg();
  }

  async function draftAsIs(): Promise<{ score: number; text: string }> {
    const res = await fetch(`/api/capabilities/${selectedCapId}/draft-as-is`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const draft = await res.json();
    return { score: draft.score, text: draft.evidence };
  }

  async function draftToBe(): Promise<{ score: number; text: string }> {
    const res = await fetch(`/api/capabilities/${selectedCapId}/draft-to-be`, { method: "POST" });
    const draft = await res.json();
    return { score: draft.score, text: draft.rationale };
  }

  const selectedCap = org?.domains.flatMap((d) => d.capabilities).find((c) => c.id === selectedCapId);
  const selectedDomain = org?.domains.find((d) => d.capabilities.some((c) => c.id === selectedCapId));

  if (loading) return <div className="flex-1 flex items-center justify-center text-[var(--muted)]">Loading...</div>;

  if (!org || org.domains.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center flex-col gap-4 text-center px-4">
        <div className="text-4xl">⚙️</div>
        <h2 className="font-semibold text-[var(--foreground)]">No domains configured</h2>
        <p className="text-sm text-[var(--muted)] max-w-sm">
          Configure business domains and capabilities before starting the assessment
        </p>
        <Link href={`/clients/${id}/configure`} className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium">
          Go to Configure
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden" style={{ height: "calc(100vh - 3.5rem)" }}>
      <aside className="w-64 bg-white border-r border-[var(--card-border)] flex flex-col overflow-hidden shrink-0">
        <div className="p-3 border-b border-[var(--card-border)]">
          <div className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Capabilities</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {org.domains.map((domain) => (
            <div key={domain.id}>
              <div className="flex items-center gap-2 px-3 py-2 bg-[var(--muted-bg)] sticky top-0 z-10">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: domain.color ?? "#94a3b8" }} />
                <span className="text-xs font-semibold text-[var(--foreground)] truncate">{domain.name}</span>
              </div>
              {domain.capabilities.map((cap) => {
                const gap = calculateGap(cap.currentAsIs, cap.currentToBe);
                const severity = getGapSeverity(gap);
                const isSelected = cap.id === selectedCapId;
                return (
                  <button
                    key={cap.id}
                    onClick={() => setSelectedCapId(cap.id)}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-2 transition-colors ${
                      isSelected ? "bg-[var(--accent)]/10 border-r-2 border-[var(--accent)]" : "hover:bg-[var(--muted-bg)]"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs truncate ${isSelected ? "font-semibold text-[var(--accent)]" : "text-[var(--foreground)]"}`}>
                        {cap.name}
                      </div>
                    </div>
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: getGapColor(severity) }} />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {!selectedCap || !history ? (
          <div className="flex items-center justify-center h-full text-[var(--muted)]">Select a capability to begin</div>
        ) : (
          <div className="max-w-3xl mx-auto px-6 py-6">
            <div className="mb-6">
              {selectedDomain && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full text-white" style={{ background: selectedDomain.color ?? "#94a3b8" }}>
                  {selectedDomain.name}
                </span>
              )}
              <h2 className="text-xl font-bold text-[var(--foreground)] mt-1">{selectedCap.name}</h2>
              {selectedCap.description && <p className="text-sm text-[var(--muted)] mt-0.5">{selectedCap.description}</p>}
              {selectedCap.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {selectedCap.tags.map((tag) => (
                    <span key={tag} className="text-xs px-2 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-[var(--card-border)] p-5 mb-4 shadow-sm">
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">Current State (As-Is)</h3>
              <div className="space-y-2 mb-4">
                {history.currentAsIs.length === 0 ? (
                  <p className="text-xs text-[var(--muted)]">Not yet assessed.</p>
                ) : (
                  history.currentAsIs.map((entry) => (
                    <div key={entry.locationTag ?? "org-wide"} className="flex items-center gap-2 text-sm">
                      <span className="score-pill text-xs font-bold">{entry.score}</span>
                      <span className="text-[var(--muted)]">{entry.locationTag ?? "Org-wide"}</span>
                    </div>
                  ))
                )}
              </div>
              <EntryForm kind="asIs" onSubmit={saveAsIs} onDraft={draftAsIs} />
              {history.asIsHistory.length > 0 && (
                <button onClick={() => setShowAsIsHistory((v) => !v)} className="text-xs text-[var(--accent)] mt-3">
                  {showAsIsHistory ? "Hide" : "Show"} history ({history.asIsHistory.length})
                </button>
              )}
              {showAsIsHistory && (
                <div className="mt-2 space-y-1 border-t border-[var(--card-border)] pt-2">
                  {history.asIsHistory.map((h, i) => (
                    <div key={i} className="text-xs text-[var(--muted)]">
                      <strong>{h.score}</strong> · {h.locationTag ?? "Org-wide"} · {h.assessedAt ? new Date(h.assessedAt).toLocaleDateString() : ""} — {h.evidence}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-[var(--card-border)] p-5 mb-4 shadow-sm">
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">Target State (To-Be)</h3>
              <div className="space-y-2 mb-4">
                {history.currentToBe.length === 0 ? (
                  <p className="text-xs text-[var(--muted)]">No target set yet.</p>
                ) : (
                  history.currentToBe.map((entry) => (
                    <div key={entry.locationTag ?? "org-wide"} className="flex items-center gap-2 text-sm">
                      <span className="score-pill text-xs font-bold" style={{ background: "#dcfce7", color: "#14532d" }}>{entry.score}</span>
                      <span className="text-[var(--muted)]">{entry.locationTag ?? "Org-wide"}</span>
                    </div>
                  ))
                )}
              </div>
              <EntryForm kind="toBe" onSubmit={saveToBe} onDraft={draftToBe} />
              {history.toBeHistory.length > 0 && (
                <button onClick={() => setShowToBeHistory((v) => !v)} className="text-xs text-[var(--accent)] mt-3">
                  {showToBeHistory ? "Hide" : "Show"} history ({history.toBeHistory.length})
                </button>
              )}
              {showToBeHistory && (
                <div className="mt-2 space-y-1 border-t border-[var(--card-border)] pt-2">
                  {history.toBeHistory.map((h, i) => (
                    <div key={i} className="text-xs text-[var(--muted)]">
                      <strong>{h.score}</strong> · {h.locationTag ?? "Org-wide"} · {h.setAt ? new Date(h.setAt).toLocaleDateString() : ""} — {h.rationale}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-[var(--card-border)] p-5 mb-8 shadow-sm text-center">
              <span className="text-xs text-[var(--muted)]">Gap: </span>
              <span className="text-sm font-bold" style={{ color: getGapColor(getGapSeverity(calculateGap(history.currentAsIs, history.currentToBe))) }}>
                {calculateGap(history.currentAsIs, history.currentToBe)?.toFixed(1) ?? "—"}
              </span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Manually verify**

Run: `npm run build`
Expected: succeeds, `/clients/[id]/assess` compiles with no type errors.

- [ ] **Step 3: Commit**

```bash
git add app/clients/\[id\]/assess/page.tsx
git commit -m "Rewrite assess page on the versioned as-is/to-be maturity model"
```

---

### Task 8: Analysis page rewrite

**Files:**
- Modify (full rewrite): `app/clients/[id]/analysis/page.tsx`

**Interfaces:**
- Consumes: `GET /api/clients/[id]` (Task 2), `calculateDomainScore`/`buildRadarData`/`getGapSeverity`/`getOverallMaturity`/`type CapabilityMaturity`/`type DomainScore` (`lib/scoring/engine.ts`, Task 2).
- Produces: nothing consumed by later tasks — leaf UI page.

- [ ] **Step 1: Write the page**

Replace the full contents of `app/clients/[id]/analysis/page.tsx`:

```tsx
"use client";

import { useState, useEffect, use } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import {
  buildRadarData,
  calculateDomainScore,
  getGapSeverity,
  getOverallMaturity,
  type DomainScore,
  type MaturitySnapshot,
} from "@/lib/scoring/engine";

type Capability = {
  id: string;
  name: string;
  importanceScore: number | null;
  currentAsIs: MaturitySnapshot[];
  currentToBe: MaturitySnapshot[];
};

type Domain = { id: string; name: string; color: string | null; capabilities: Capability[] };
type Org = { id: string; name: string; domains: Domain[] };

export default function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [org, setOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/clients/${id}`).then((r) => r.json()).then(setOrg).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex-1 flex items-center justify-center text-[var(--muted)]">Loading...</div>;
  if (!org) return null;

  const domainScores: DomainScore[] = org.domains.map((d) => {
    const result = calculateDomainScore(
      d.capabilities.map((c) => ({
        id: c.id,
        name: c.name,
        importanceScore: c.importanceScore,
        asIs: c.currentAsIs,
        toBe: c.currentToBe,
      }))
    );
    return { id: d.id, name: d.name, color: d.color, ...result };
  });

  const radarData = buildRadarData(domainScores);
  const overallMaturity = getOverallMaturity(domainScores);

  const allCaps = domainScores.flatMap((d) =>
    d.capabilities.map((c) => ({ ...c, domainName: d.name, domainColor: d.color }))
  );
  const sortedByGap = [...allCaps].filter((c) => c.gapScore != null).sort((a, b) => (b.gapScore ?? 0) - (a.gapScore ?? 0));
  const hasData = domainScores.some((d) => d.averageAsIs > 0);

  return (
    <div className="max-w-6xl mx-auto w-full px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--foreground)]">Gap Analysis</h1>
        <p className="text-sm text-[var(--muted)]">Capability maturity and growth opportunity overview</p>
      </div>

      {!hasData ? (
        <div className="bg-white rounded-xl border border-[var(--card-border)] p-12 text-center">
          <div className="text-4xl mb-3">📊</div>
          <h3 className="font-semibold text-[var(--foreground)] mb-1">No assessment data yet</h3>
          <p className="text-sm text-[var(--muted)]">Complete some capability assessments to see your gap analysis</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-xl border border-[var(--card-border)] p-4">
              <div className="text-2xl font-bold text-[var(--primary)]">{overallMaturity}/5</div>
              <div className="text-xs text-[var(--muted)] mt-0.5">Overall Maturity</div>
            </div>
            <div className="bg-white rounded-xl border border-[var(--card-border)] p-4">
              <div className="text-2xl font-bold text-[var(--destructive)]">{sortedByGap[0]?.gapScore?.toFixed(1) ?? "—"}</div>
              <div className="text-xs text-[var(--muted)] mt-0.5">Largest Gap</div>
            </div>
            <div className="bg-white rounded-xl border border-[var(--card-border)] p-4">
              <div className="text-2xl font-bold text-amber-600">{allCaps.filter((c) => getGapSeverity(c.gapScore) === "critical").length}</div>
              <div className="text-xs text-[var(--muted)] mt-0.5">Critical Gaps</div>
            </div>
            <div className="bg-white rounded-xl border border-[var(--card-border)] p-4">
              <div className="text-2xl font-bold text-[var(--success)]">{allCaps.filter((c) => c.asIsScore != null).length}/{allCaps.length}</div>
              <div className="text-xs text-[var(--muted)] mt-0.5">Capabilities Assessed</div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[var(--card-border)] p-6 mb-6 shadow-sm">
            <h2 className="font-semibold text-[var(--foreground)] mb-4">Domain Radar — As-Is vs To-Be</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="domain" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fontSize: 9, fill: "#94a3b8" }} tickCount={6} />
                  <Radar name="To-Be" dataKey="To-Be" stroke="#16a34a" fill="#16a34a" fillOpacity={0.1} strokeWidth={2} strokeDasharray="4 2" />
                  <Radar name="As-Is" dataKey="As-Is" stroke="#2563eb" fill="#2563eb" fillOpacity={0.2} strokeWidth={2} />
                  <Tooltip formatter={(value, name) => [typeof value === "number" ? value.toFixed(1) : value, name]} />
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[var(--card-border)] p-6 mb-6 shadow-sm">
            <h2 className="font-semibold text-[var(--foreground)] mb-4">Domain Scores</h2>
            <div className="space-y-4">
              {domainScores.map((d) => (
                <div key={d.id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: d.color ?? "#94a3b8" }} />
                      <span className="text-sm font-medium text-[var(--foreground)]">{d.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-[var(--muted)]">As-Is: <strong className="text-[var(--foreground)]">{d.averageAsIs}</strong></span>
                      <span className="text-[var(--muted)]">To-Be: <strong className="text-[var(--foreground)]">{d.averageToBe}</strong></span>
                      <span className={`font-semibold ${d.averageGap > 3 ? "text-[var(--destructive)]" : d.averageGap > 1 ? "text-amber-600" : "text-[var(--success)]"}`}>
                        Gap: {d.averageGap.toFixed(1)}
                      </span>
                    </div>
                  </div>
                  <div className="relative h-3 bg-[var(--muted-bg)] rounded-full overflow-hidden">
                    <div className="absolute inset-y-0 left-0 rounded-full opacity-30" style={{ width: `${(d.averageToBe / 5) * 100}%`, background: d.color ?? "#94a3b8" }} />
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(d.averageAsIs / 5) * 100}%`, background: d.color ?? "#94a3b8" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[var(--card-border)] p-6 mb-6 shadow-sm overflow-x-auto">
            <h2 className="font-semibold text-[var(--foreground)] mb-4">Capability Heatmap</h2>
            <div className="min-w-[600px]">
              {domainScores.map((domain) => (
                <div key={domain.id} className="mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: domain.color ?? "#94a3b8" }} />
                    <span className="text-xs font-semibold text-[var(--muted)]">{domain.name}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {domain.capabilities.map((cap) => {
                      const severity = getGapSeverity(cap.gapScore);
                      const assessed = cap.asIsScore != null;
                      return (
                        <div
                          key={cap.id}
                          className={`px-3 py-2 rounded-lg text-xs border transition-all ${assessed ? "border-transparent" : "border-[var(--card-border)] border-dashed"}`}
                          style={{ background: assessed ? (severity === "critical" || severity === "high" ? "#fca5a5" : severity === "medium" ? "#fef08a" : severity === "low" ? "#bbf7d0" : "#f1f5f9") : "#f8fafc" }}
                          title={`As-Is: ${cap.asIsScore ?? "—"} | To-Be: ${cap.toBeScore ?? "—"} | Gap: ${cap.gapScore?.toFixed(1) ?? "—"}`}
                        >
                          <div className={`font-medium mb-0.5 ${assessed ? "text-gray-800" : "text-[var(--muted)]"}`}>{cap.name}</div>
                          <div className="text-gray-600">{assessed ? `${cap.asIsScore} → ${cap.toBeScore ?? "?"}` : "Not assessed"}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[var(--card-border)]">
              <span className="text-xs text-[var(--muted)]">Gap legend:</span>
              {[
                { label: "Low (≤1)", color: "#bbf7d0" },
                { label: "Medium (≤2)", color: "#fef08a" },
                { label: "High (≤3)", color: "#fca5a5" },
                { label: "Critical (>3)", color: "#f87171" },
                { label: "Not assessed", color: "#f8fafc", border: true },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded" style={{ background: item.color, border: item.border ? "1px dashed #cbd5e1" : "none" }} />
                  <span className="text-xs text-[var(--muted)]">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[var(--card-border)] p-6 shadow-sm">
            <h2 className="font-semibold text-[var(--foreground)] mb-4">Priority Gaps</h2>
            {sortedByGap.length === 0 ? (
              <p className="text-sm text-[var(--muted)] text-center py-4">No gaps calculated yet</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--card-border)]">
                    <th className="text-left text-xs text-[var(--muted)] font-medium pb-2">Capability</th>
                    <th className="text-left text-xs text-[var(--muted)] font-medium pb-2">Domain</th>
                    <th className="text-center text-xs text-[var(--muted)] font-medium pb-2">As-Is</th>
                    <th className="text-center text-xs text-[var(--muted)] font-medium pb-2">To-Be</th>
                    <th className="text-center text-xs text-[var(--muted)] font-medium pb-2">Gap</th>
                    <th className="text-left text-xs text-[var(--muted)] font-medium pb-2">Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedByGap.map((cap) => {
                    const severity = getGapSeverity(cap.gapScore);
                    return (
                      <tr key={cap.id} className="border-b border-[var(--card-border)] last:border-0">
                        <td className="py-2.5 font-medium text-[var(--foreground)]">{cap.name}</td>
                        <td className="py-2.5">
                          <span className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: cap.domainColor ?? "#94a3b8" }} />
                            <span className="text-[var(--muted)]">{cap.domainName}</span>
                          </span>
                        </td>
                        <td className="py-2.5 text-center font-mono">{cap.asIsScore ?? "—"}</td>
                        <td className="py-2.5 text-center font-mono">{cap.toBeScore ?? "—"}</td>
                        <td className="py-2.5 text-center">
                          <span
                            className="px-2 py-0.5 rounded text-xs font-bold"
                            style={{
                              background: severity === "critical" || severity === "high" ? "#fee2e2" : severity === "medium" ? "#fef9c3" : "#dcfce7",
                              color: severity === "critical" || severity === "high" ? "#991b1b" : severity === "medium" ? "#854d0e" : "#14532d",
                            }}
                          >
                            {cap.gapScore?.toFixed(1) ?? "—"}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <span className={`text-xs font-medium ${severity === "critical" ? "text-[var(--destructive)]" : severity === "high" ? "text-red-500" : severity === "medium" ? "text-amber-600" : "text-[var(--success)]"}`}>
                            {severity.charAt(0).toUpperCase() + severity.slice(1)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

Per the design spec's multi-location display rule, a capability with more than one current as-is location score already shows both in the "Priority Gaps" table if you sort by capability — but since `calculateDomainScore` collapses each capability to one averaged row for the table/heatmap, per-location detail for a capability lives on the assess page (Task 7), which is where the spec's multi-location display requirement is satisfied at the individual-capability level; this page's role is the domain-level aggregate view.

- [ ] **Step 2: Manually verify**

Run: `npm run build`
Expected: succeeds, `/clients/[id]/analysis` compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add app/clients/\[id\]/analysis/page.tsx
git commit -m "Rewrite analysis page on the versioned as-is/to-be maturity model, 0-5 scale"
```

---

### Task 9: Report page rewrite

**Files:**
- Modify (full rewrite): `app/clients/[id]/report/page.tsx`

**Interfaces:**
- Consumes: `GET /api/clients/[id]` (Task 2), `calculateDomainScore`/`getGapSeverity`/`getOverallMaturity`/`type DomainScore`/`type MaturitySnapshot` (`lib/scoring/engine.ts`, Task 2).
- Produces: nothing consumed by later tasks — leaf UI page, final task in this plan.

- [ ] **Step 1: Write the page**

Replace the full contents of `app/clients/[id]/report/page.tsx`:

```tsx
"use client";

import { useState, useEffect, use } from "react";
import {
  calculateDomainScore,
  getGapSeverity,
  getOverallMaturity,
  type DomainScore,
  type MaturitySnapshot,
} from "@/lib/scoring/engine";

type Capability = {
  id: string;
  name: string;
  importanceScore: number | null;
  tags: string[];
  currentAsIs: MaturitySnapshot[];
  currentToBe: MaturitySnapshot[];
};

type Domain = { id: string; name: string; color: string | null; capabilities: Capability[] };

type KPI = { id: string; name: string; currentValue: string | null; targetValue: string | null };
type Achievement = { id: string; description: string; priority: number | null; targetDate: string | null; status: string };

type Org = {
  id: string;
  name: string;
  industry: string | null;
  size: string | null;
  notes: string | null;
  engagementMotive: string | null;
  domains: Domain[];
  kpis: KPI[];
  achievements: Achievement[];
};

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [org, setOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/clients/${id}`).then((r) => r.json()).then(setOrg).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex-1 flex items-center justify-center text-[var(--muted)]">Loading...</div>;
  if (!org) return null;

  const domainScores: DomainScore[] = org.domains.map((d) => {
    const result = calculateDomainScore(
      d.capabilities.map((c) => ({ id: c.id, name: c.name, importanceScore: c.importanceScore, asIs: c.currentAsIs, toBe: c.currentToBe }))
    );
    return { id: d.id, name: d.name, color: d.color, ...result };
  });

  const overallMaturity = getOverallMaturity(domainScores);
  const allCaps = domainScores.flatMap((d) => d.capabilities.map((c) => ({ ...c, domainName: d.name })));
  const topGaps = [...allCaps].filter((c) => c.gapScore != null && c.gapScore > 0).sort((a, b) => (b.gapScore ?? 0) - (a.gapScore ?? 0)).slice(0, 5);

  const allTags = org.domains.flatMap((d) => d.capabilities.flatMap((c) => c.tags ?? [])).filter(Boolean);
  const tagCounts = new Map<string, number>();
  for (const tag of allTags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  const topTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);

  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="max-w-4xl mx-auto w-full px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)]">Executive Report</h1>
          <p className="text-sm text-[var(--muted)]">Generated {today}</p>
        </div>
        <button onClick={() => window.print()} className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:bg-[#1a3352] transition-colors">
          Print / Export PDF
        </button>
      </div>

      <div className="space-y-6 print:space-y-4" id="report">
        <div className="bg-[var(--primary)] text-white rounded-xl p-8 print:rounded-none">
          <div className="text-xs font-semibold uppercase tracking-widest text-white/60 mb-2">Capability Assessment Report</div>
          <h2 className="text-3xl font-bold mb-1">{org.name}</h2>
          {org.industry && <div className="text-white/70 text-sm">{org.industry}</div>}
          {org.engagementMotive && <div className="text-white/70 text-sm">Engagement motive: {org.engagementMotive}</div>}
          <div className="mt-6 flex items-center gap-6">
            <div>
              <div className="text-3xl font-bold">{overallMaturity}/5</div>
              <div className="text-sm text-white/70">Overall Maturity</div>
            </div>
            <div>
              <div className="text-3xl font-bold">{org.domains.length}</div>
              <div className="text-sm text-white/70">Business Domains</div>
            </div>
            <div>
              <div className="text-3xl font-bold">{allCaps.filter((c) => c.asIsScore != null).length}</div>
              <div className="text-sm text-white/70">Capabilities Assessed</div>
            </div>
          </div>
          <div className="text-xs text-white/40 mt-6">{today} · Prepared by Flow State Partners</div>
        </div>

        <div className="bg-white rounded-xl border border-[var(--card-border)] p-6 shadow-sm">
          <h3 className="font-bold text-[var(--foreground)] text-lg mb-4 pb-3 border-b border-[var(--card-border)]">Executive Summary</h3>
          <div className="grid grid-cols-3 gap-4 mb-6">
            {domainScores.map((d) => (
              <div key={d.id} className="p-3 bg-[var(--muted-bg)] rounded-lg">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: d.color ?? "#94a3b8" }} />
                  <span className="text-xs font-semibold text-[var(--foreground)] truncate">{d.name}</span>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <span className="text-xl font-bold text-[var(--foreground)]">{d.averageAsIs}</span>
                    <span className="text-xs text-[var(--muted)]">/5</span>
                  </div>
                  <span className={`text-xs font-medium ${d.averageGap > 3 ? "text-[var(--destructive)]" : d.averageGap > 1 ? "text-amber-600" : "text-[var(--success)]"}`}>
                    Gap: {d.averageGap.toFixed(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {org.notes && <p className="text-sm text-[var(--muted)] italic border-l-4 border-[var(--accent)] pl-4">{org.notes}</p>}
        </div>

        {topGaps.length > 0 && (
          <div className="bg-white rounded-xl border border-[var(--card-border)] p-6 shadow-sm">
            <h3 className="font-bold text-[var(--foreground)] text-lg mb-4 pb-3 border-b border-[var(--card-border)]">Top Priority Gaps</h3>
            <div className="space-y-3">
              {topGaps.map((cap, i) => {
                const severity = getGapSeverity(cap.gapScore);
                return (
                  <div key={cap.id} className="flex items-start gap-4 p-4 rounded-lg bg-[var(--muted-bg)]">
                    <div className="w-7 h-7 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-sm font-bold shrink-0">{i + 1}</div>
                    <div className="flex-1">
                      <div className="font-semibold text-[var(--foreground)]">{cap.name}</div>
                      <div className="text-xs text-[var(--muted)] mb-1">{cap.domainName}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-2xl font-bold text-[var(--foreground)]">
                        {cap.asIsScore} <span className="text-xs text-[var(--muted)] font-normal">→</span> {cap.toBeScore}
                      </div>
                      <div className={`text-xs font-semibold ${severity === "critical" ? "text-[var(--destructive)]" : severity === "high" ? "text-red-500" : severity === "medium" ? "text-amber-600" : "text-[var(--success)]"}`}>
                        Gap: {cap.gapScore?.toFixed(1)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {topTags.length > 0 && (
          <div className="bg-white rounded-xl border border-[var(--card-border)] p-6 shadow-sm">
            <h3 className="font-bold text-[var(--foreground)] text-lg mb-4 pb-3 border-b border-[var(--card-border)]">Recurring Themes</h3>
            <div className="flex flex-wrap gap-2">
              {topTags.map(([tag, count]) => (
                <span key={tag} className="text-sm px-3 py-1 bg-[var(--muted-bg)] text-[var(--foreground)] rounded-full">
                  {tag} <span className="text-[var(--muted)]">({count})</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {org.domains.map((domain, di) => {
          const caps = domainScores[di].capabilities.filter((c) => c.asIsScore != null);
          if (caps.length === 0) return null;
          return (
            <div key={domain.id} className="bg-white rounded-xl border border-[var(--card-border)] p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[var(--card-border)]">
                <div className="w-3 h-3 rounded-full" style={{ background: domain.color ?? "#94a3b8" }} />
                <h3 className="font-bold text-[var(--foreground)] text-lg">{domain.name}</h3>
              </div>
              <div className="space-y-3">
                {caps.map((cap) => (
                  <div key={cap.id} className="border border-[var(--card-border)] rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-semibold text-[var(--foreground)]">{cap.name}</div>
                      </div>
                      <div className="text-right ml-4 shrink-0">
                        <div className="text-lg font-bold text-[var(--foreground)]">{cap.asIsScore} → {cap.toBeScore ?? "?"}</div>
                        {cap.gapScore != null && (
                          <div className="text-xs text-[var(--muted)]">Gap: <strong>{cap.gapScore.toFixed(1)}</strong></div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {org.achievements.length > 0 && (
          <div className="bg-white rounded-xl border border-[var(--card-border)] p-6 shadow-sm">
            <h3 className="font-bold text-[var(--foreground)] text-lg mb-4 pb-3 border-b border-[var(--card-border)]">Target Achievements</h3>
            <div className="space-y-2">
              {org.achievements.map((ach) => (
                <div key={ach.id} className="flex items-center gap-4 p-3 bg-[var(--muted-bg)] rounded-lg">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${ach.status === "achieved" ? "bg-[var(--success)]" : "bg-[var(--muted)]"}`} />
                  <div className="flex-1 text-sm text-[var(--foreground)]">{ach.description}</div>
                  {ach.targetDate && <div className="text-xs text-[var(--muted)] shrink-0">{new Date(ach.targetDate).toLocaleDateString()}</div>}
                  <div className="text-xs font-medium text-[var(--muted)] shrink-0">Priority: {ach.priority}/10</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {org.kpis.length > 0 && (
          <div className="bg-white rounded-xl border border-[var(--card-border)] p-6 shadow-sm">
            <h3 className="font-bold text-[var(--foreground)] text-lg mb-4 pb-3 border-b border-[var(--card-border)]">Key Performance Indicators</h3>
            <div className="grid grid-cols-2 gap-3">
              {org.kpis.map((kpi) => (
                <div key={kpi.id} className="p-3 border border-[var(--card-border)] rounded-lg">
                  <div className="font-medium text-sm text-[var(--foreground)]">{kpi.name}</div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-[var(--muted)]">
                    {kpi.currentValue && <span>Current: <strong>{kpi.currentValue}</strong></span>}
                    {kpi.targetValue && <span>Target: <strong>{kpi.targetValue}</strong></span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-center text-xs text-[var(--muted)] py-4">Prepared by Flow State Partners · {today}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manually verify**

Run: `npm run build`
Expected: succeeds, `/clients/[id]/report` compiles cleanly.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all test files pass — the pre-existing suite plus this plan's new files (`scoring-engine`, `maturity-target`, `clients-route`, `maturity-create-routes`, `assessment-history-route`, `maturity-draft-generator`, `maturity-draft-routes`).

- [ ] **Step 4: Commit**

```bash
git add app/clients/\[id\]/report/page.tsx
git commit -m "Rewrite report page on the versioned as-is/to-be maturity model, 0-5 scale"
```

---

## Definition of Done for this Plan

- `npm test` passes with all test files green.
- `npm run build` succeeds.
- `ANTHROPIC_API_KEY` already set from Phase 1 — no new credential needed for this plan.
- Manually recording an as-is and a to-be score for a capability (with and without AI drafting), and seeing the gap/radar/report reflect it — required for real end-to-end verification, not covered by the automated suite.
