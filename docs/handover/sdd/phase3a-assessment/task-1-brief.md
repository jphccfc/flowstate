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

