# Flow State Data Model (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the ingestion, tagging, maturity-assessment, dependency, conflict, recommendation, and follow-up-suggestion data models to the `flowstate` Prisma schema, migrated against the real Supabase Postgres database, with seed data for the window/door manufacturer scenario (Alexandria + Brampton).

**Architecture:** Purely additive schema change on top of the existing Phase 1 Prisma schema (`Organization` → `BusinessDomain` → `Capability` → `KPI`/`Stakeholder`/`Process`/`Technology`). No application code (API routes, pages) is touched in this plan — that's Phase 2/3 work. Every new model follows the existing convention: `cuid()` primary keys, `onDelete: Cascade` from the owning parent, `createdAt`/`updatedAt` timestamps where the model can change over time.

**Tech Stack:** Next.js 16 / Prisma 7.8 (`prisma-client` generator, client committed to `app/generated/prisma`) / PostgreSQL via Supabase / Vitest (new, for integration tests) / `pg` + `@prisma/adapter-pg`.

## Global Constraints

- Database is a real Supabase Postgres project (already connected; `DATABASE_URL`/`DIRECT_URL` are set in Vercel Production + Preview and pulled to `.env.local` for local dev). Do not use a mocked/in-memory database for any test in this plan — every test in this plan is an integration test against this real database.
- The Prisma generated client is committed to the repo at `app/generated/prisma` (see the existing commit "Remove postinstall prisma generate"). Every task that changes `prisma/schema.prisma` must run `npx prisma generate` and `git add app/generated/prisma` as part of its commit.
- All new models use `id String @id @default(cuid())`, matching every existing model.
- `locationTag` is a free-text `String?` field (no enum, no FK) per the design spec §4.1 — do not add a `Location` model or DB-level constraint on it.
- **Do not remove `Capability.asIsScore` / `toBeScore` / `asIsNotes` in this plan.** The design spec (§4.3) calls for dropping them, but the current `assess`/`analysis`/`report` pages and `/api/capabilities` routes still read/write them. Removing them now would break the running app outside this plan's scope. Task 4 adds `MaturityAssessment` and `CapabilityKPIMaturityCeiling` alongside the existing fields, unchanged. The removal + app-code rewire happens in the Phase 3 (Assessment & Gap Analysis) plan, where the replacement read path is built in the same plan that breaks the old one.
- Test framework is Vitest (net new to this repo — no test framework exists yet). Config and a DB test-helper are established in Task 1 and reused by every later task.
- Node version in use locally: v20.20.2. `npm run` scripts, not `pnpm`/`yarn` (repo already uses `npm`).

---

## File Structure

- `prisma/schema.prisma` — modified in every task (append new enums/models).
- `prisma/migrations/` — new; one migration per task via `prisma migrate dev`.
- `app/generated/prisma/**` — regenerated (not hand-edited) in every task.
- `vitest.config.ts` — new (Task 1). Vitest config, points at `tests/setup.ts`.
- `tests/setup.ts` — new (Task 1). Loads `.env.local` so `DATABASE_URL` is available under Vitest.
- `tests/helpers/db.ts` — new (Task 1). Shared Prisma client + `createTestOrganization()` / `cleanupOrganization()` helpers reused by every test file in this plan.
- `tests/schema/ingestion.test.ts` — new (Task 2).
- `tests/schema/tagging.test.ts` — new (Task 3).
- `tests/schema/maturity.test.ts` — new (Task 4).
- `tests/schema/dependency-conflict.test.ts` — new (Task 5).
- `tests/schema/recommendation.test.ts` — new (Task 6).
- `tests/schema/followup-job.test.ts` — new (Task 7).
- `prisma/seed.ts` — modified (Task 8) to seed the window/door manufacturer scenario instead of "Demo Company Ltd".
- `tests/schema/current-maturity.test.ts` — new (Task 9). Tests the "latest assessment per capability, grouped by locationTag" read pattern.
- `lib/maturity/current.ts` — new (Task 9). `getCurrentMaturity()` helper — the one piece of query logic this plan produces ahead of Phase 3.

---

### Task 1: Baseline migration history + Vitest test infrastructure

**Files:**
- Create: `prisma/migrations/0_init/migration.sql`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `tests/helpers/db.ts`
- Create: `tests/schema/smoke.test.ts`
- Modify: `package.json` (add `vitest` devDependency, add `test` script)

**Interfaces:**
- Produces: `tests/helpers/db.ts` exports `prisma` (a `PrismaClient` instance), `createTestOrganization(overrides?: { name?: string }): Promise<{ id: string; name: string }>`, and `cleanupOrganization(id: string): Promise<void>`. Every later task's tests import these three.

The repo currently has schema already pushed to the database via `prisma db push` (confirmed: 18 tables exist, no `_prisma_migrations` table). To start using `prisma migrate dev` for every task from here on, the current schema must first be recorded as an already-applied baseline migration.

- [ ] **Step 1: Create the baseline migration directory and SQL**

Run:
```bash
mkdir -p prisma/migrations/0_init
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql
```
Expected: `prisma/migrations/0_init/migration.sql` is created containing `CREATE TABLE` statements for all 18 existing models (Organization, BusinessDomain, Capability, ... AssessmentSession).

- [ ] **Step 2: Mark the baseline migration as already applied**

Run:
```bash
npx prisma migrate resolve --applied 0_init
```
Expected output includes: `Migration 0_init marked as applied.`

This does NOT run the SQL (the tables already exist) — it just tells Prisma's migration history that this state is the starting point.

- [ ] **Step 3: Verify migration status is clean**

Run:
```bash
npx prisma migrate status
```
Expected: `Database schema is up to date!`

- [ ] **Step 4: Install Vitest**

Run:
```bash
npm install -D vitest
```
Expected: `vitest` appears under `devDependencies` in `package.json`.

- [ ] **Step 5: Add the `test` script**

Modify `package.json`, in the `"scripts"` block, add:
```json
    "test": "vitest run"
```
(placed after `"db:seed": "tsx prisma/seed.ts"`, before the closing brace of `"scripts"`)

- [ ] **Step 6: Write the env-loading test setup file**

Create `tests/setup.ts`:
```typescript
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../.env.local") });
```

- [ ] **Step 7: Write the Vitest config**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
```

- [ ] **Step 8: Write the shared DB test helper**

Create `tests/helpers/db.ts`:
```typescript
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../../app/generated/prisma/client";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

export async function createTestOrganization(overrides?: { name?: string }) {
  return prisma.organization.create({
    data: {
      name: overrides?.name ?? `Test Org ${Date.now()}`,
      industry: "Manufacturing",
    },
  });
}

export async function cleanupOrganization(id: string) {
  await prisma.organization.delete({ where: { id } });
}
```

- [ ] **Step 9: Write a smoke test proving the harness works end to end**

Create `tests/schema/smoke.test.ts`:
```typescript
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
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `npm test`
Expected: `tests/schema/smoke.test.ts` passes (1 test, 1 passed). If it fails with a connection error, confirm `.env.local` exists and has a non-empty `DATABASE_URL` (`grep DATABASE_URL .env.local`).

- [ ] **Step 11: Commit**

```bash
git add prisma/migrations vitest.config.ts tests/setup.ts tests/helpers/db.ts tests/schema/smoke.test.ts package.json package-lock.json
git commit -m "Baseline Prisma migration history and add Vitest integration test harness"
```

---

### Task 2: Ingestion models — `CapturedInput`, `CapturedSegment`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `tests/schema/ingestion.test.ts`

**Interfaces:**
- Consumes: `prisma`, `createTestOrganization`, `cleanupOrganization` from `tests/helpers/db.ts` (Task 1).
- Produces: Prisma models `CapturedInput` (fields: `id`, `organizationId`, `sessionId?`, `type: InputType`, `sourceRef?`, `rawText?`, `locationTag?`, `status: ProcessingStatus`, `error?`, `capturedAt`, `createdAt`, `updatedAt`) and `CapturedSegment` (fields: `id`, `capturedInputId`, `order`, `speaker?`, `text`, `startMs?`, `endMs?`, `createdAt`), each accessible via `prisma.capturedInput` / `prisma.capturedSegment`. Later tasks (3, 7) create `CapturedSegment` rows and reference `capturedInputId`.

- [ ] **Step 1: Write the failing test**

Create `tests/schema/ingestion.test.ts`:
```typescript
import { afterAll, describe, expect, it } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

describe("ingestion models", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("creates a CapturedInput with segments and reads them back", async () => {
    const org = await createTestOrganization({ name: "Ingestion Test Org" });
    orgId = org.id;

    const input = await prisma.capturedInput.create({
      data: {
        organizationId: org.id,
        type: "AUDIO",
        locationTag: "Brampton",
        status: "TRANSCRIBED",
        rawText: "We are losing money on night shift.",
        segments: {
          create: [
            { order: 0, text: "We are losing money on night shift.", speaker: "Plant Manager" },
          ],
        },
      },
      include: { segments: true },
    });

    expect(input.locationTag).toBe("Brampton");
    expect(input.segments).toHaveLength(1);
    expect(input.segments[0].text).toContain("night shift");

    const found = await prisma.organization.findUniqueOrThrow({
      where: { id: org.id },
      include: { capturedInputs: true },
    });
    expect(found.capturedInputs).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ingestion`
Expected: FAIL — `Property 'capturedInput' does not exist on type 'PrismaClient'` (the model doesn't exist yet).

- [ ] **Step 3: Add the schema**

In `prisma/schema.prisma`, add after the `AssessmentSession` model:
```prisma
enum InputType {
  AUDIO
  TEXT_NOTE
  EMAIL
  DOCUMENT
  DATA_ROOM_FILE
}

enum ProcessingStatus {
  PENDING
  TRANSCRIBING
  TRANSCRIBED
  SEGMENTING
  TAGGING
  TAGGED
  FAILED
}

model CapturedInput {
  id             String            @id @default(cuid())
  organizationId String
  sessionId      String?
  type           InputType
  sourceRef      String?
  rawText        String?
  locationTag    String?
  status         ProcessingStatus  @default(PENDING)
  error          String?
  capturedAt     DateTime          @default(now())
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt

  organization Organization       @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  session      AssessmentSession? @relation(fields: [sessionId], references: [id])
  segments     CapturedSegment[]
}

model CapturedSegment {
  id              String   @id @default(cuid())
  capturedInputId String
  order           Int
  speaker         String?
  text            String
  startMs         Int?
  endMs           Int?
  createdAt       DateTime @default(now())

  capturedInput CapturedInput @relation(fields: [capturedInputId], references: [id], onDelete: Cascade)
}
```

Modify the `Organization` model — add to its relation block (after `sessions AssessmentSession[]`):
```prisma
  capturedInputs CapturedInput[]
```

Modify the `AssessmentSession` model — add to its relation block (after `advisor User @relation(...)`):
```prisma
  capturedInputs CapturedInput[]
```

- [ ] **Step 4: Create and apply the migration**

Run:
```bash
npx prisma migrate dev --name add_ingestion_models
```
Expected: `Your database is now in sync with your schema.` A new folder appears under `prisma/migrations/` prefixed with a timestamp and suffixed `add_ingestion_models`.

- [ ] **Step 5: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: `app/generated/prisma/models/CapturedInput.ts` and `CapturedSegment.ts` are created/updated.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- ingestion`
Expected: PASS (1 test).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations app/generated/prisma tests/schema/ingestion.test.ts
git commit -m "Add CapturedInput and CapturedSegment models for raw interview/document ingestion"
```

---

### Task 3: Tagging model — `Tag`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `tests/schema/tagging.test.ts`

**Interfaces:**
- Consumes: `prisma`, `createTestOrganization`, `cleanupOrganization` from Task 1; `CapturedInput`/`CapturedSegment` from Task 2.
- Produces: Prisma model `Tag` (fields: `id`, `segmentId`, `targetType: TagTargetType`, `targetId`, `confidence: Float`, `status: TagStatus`, `reviewedBy?`, `reviewedAt?`, `createdAt`) via `prisma.tag`. Enum `TagTargetType` (`DOMAIN`/`CAPABILITY`/`KPI`/`STAKEHOLDER`) is reused by Task 5's `Dependency` and `ConflictFlag` models — do not redefine it there.

- [ ] **Step 1: Write the failing test**

Create `tests/schema/tagging.test.ts`:
```typescript
import { afterAll, describe, expect, it } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

describe("tagging model", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("tags a segment with a capability at a given confidence and supports review status transitions", async () => {
    const org = await createTestOrganization({ name: "Tagging Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({
      data: { organizationId: org.id, name: "Operations" },
    });
    const capability = await prisma.capability.create({
      data: { domainId: domain.id, name: "Shift Scheduling" },
    });
    const input = await prisma.capturedInput.create({
      data: { organizationId: org.id, type: "TEXT_NOTE", status: "TAGGED" },
    });
    const segment = await prisma.capturedSegment.create({
      data: { capturedInputId: input.id, order: 0, text: "Night shift scheduling is a mess." },
    });

    const tag = await prisma.tag.create({
      data: {
        segmentId: segment.id,
        targetType: "CAPABILITY",
        targetId: capability.id,
        confidence: 0.92,
        status: "AUTO_APPROVED",
      },
    });

    expect(tag.status).toBe("AUTO_APPROVED");

    const reassigned = await prisma.tag.update({
      where: { id: tag.id },
      data: { status: "REASSIGNED", reviewedBy: "advisor-1", reviewedAt: new Date() },
    });
    expect(reassigned.status).toBe("REASSIGNED");
    expect(reassigned.reviewedBy).toBe("advisor-1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tagging`
Expected: FAIL — `Property 'tag' does not exist on type 'PrismaClient'`.

- [ ] **Step 3: Add the schema**

In `prisma/schema.prisma`, add after the `CapturedSegment` model:
```prisma
enum TagTargetType {
  DOMAIN
  CAPABILITY
  KPI
  STAKEHOLDER
}

enum TagStatus {
  AUTO_APPROVED
  PENDING_REVIEW
  APPROVED
  REJECTED
  REASSIGNED
}

model Tag {
  id         String        @id @default(cuid())
  segmentId  String
  targetType TagTargetType
  targetId   String
  confidence Float
  status     TagStatus     @default(PENDING_REVIEW)
  reviewedBy String?
  reviewedAt DateTime?
  createdAt  DateTime      @default(now())

  segment CapturedSegment @relation(fields: [segmentId], references: [id], onDelete: Cascade)

  @@index([targetType, targetId])
}
```

Modify the `CapturedSegment` model — add to its relation block (after `capturedInput CapturedInput @relation(...)`):
```prisma
  tags Tag[]
```

- [ ] **Step 4: Create and apply the migration**

Run: `npx prisma migrate dev --name add_tagging_model`
Expected: `Your database is now in sync with your schema.`

- [ ] **Step 5: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: `app/generated/prisma/models/Tag.ts` is created.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- tagging`
Expected: PASS (1 test).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations app/generated/prisma tests/schema/tagging.test.ts
git commit -m "Add Tag model for confidence-scored segment tagging and human review"
```

---

### Task 4: Maturity models — `MaturityAssessment`, `CapabilityKPIMaturityCeiling`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `tests/schema/maturity.test.ts`

**Interfaces:**
- Consumes: `prisma`, `createTestOrganization`, `cleanupOrganization` from Task 1.
- Produces: Prisma models `MaturityAssessment` (fields: `id`, `capabilityId`, `locationTag?`, `score: Int`, `evidence?`, `sourceSegmentIds: String[]`, `assessedBy?`, `assessedAt`, `createdAt`) and `CapabilityKPIMaturityCeiling` (fields: `id`, `capabilityId`, `kpiId`, `maturityLevel: Int`, `targetCeilingMin?`, `targetCeilingMax?`, `valueToNextLevel?`, `notes?`), via `prisma.maturityAssessment` / `prisma.capabilityKPIMaturityCeiling`. Task 9's `getCurrentMaturity()` reads `MaturityAssessment` rows ordered by `assessedAt`.

- [ ] **Step 1: Write the failing test**

Create `tests/schema/maturity.test.ts`:
```typescript
import { afterAll, describe, expect, it } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

describe("maturity models", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("records a versioned maturity assessment per capability and location", async () => {
    const org = await createTestOrganization({ name: "Maturity Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({
      data: { organizationId: org.id, name: "Operations" },
    });
    const capability = await prisma.capability.create({
      data: { domainId: domain.id, name: "Extrusion Process Control" },
    });
    const kpi = await prisma.kPI.create({
      data: { organizationId: org.id, name: "On-time delivery rate", targetValue: "95%" },
    });

    await prisma.maturityAssessment.create({
      data: { capabilityId: capability.id, locationTag: "Brampton", score: 2, evidence: "Manual extrusion logs, no digital tracking" },
    });
    await prisma.maturityAssessment.create({
      data: { capabilityId: capability.id, locationTag: "Brampton", score: 3, evidence: "Digital tracking introduced" },
    });

    const history = await prisma.maturityAssessment.findMany({
      where: { capabilityId: capability.id, locationTag: "Brampton" },
      orderBy: { assessedAt: "asc" },
    });
    expect(history).toHaveLength(2);
    expect(history[1].score).toBe(3);

    const ceiling = await prisma.capabilityKPIMaturityCeiling.create({
      data: {
        capabilityId: capability.id,
        kpiId: kpi.id,
        maturityLevel: 2,
        targetCeilingMin: 50,
        targetCeilingMax: 60,
        valueToNextLevel: 250000,
      },
    });
    expect(ceiling.valueToNextLevel).toBe(250000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- maturity`
Expected: FAIL — `Property 'maturityAssessment' does not exist on type 'PrismaClient'`.

- [ ] **Step 3: Add the schema**

In `prisma/schema.prisma`, add after the `Tag` model:
```prisma
model MaturityAssessment {
  id               String   @id @default(cuid())
  capabilityId     String
  locationTag      String?
  score            Int
  evidence         String?
  sourceSegmentIds String[]
  assessedBy       String?
  assessedAt       DateTime @default(now())
  createdAt        DateTime @default(now())

  capability Capability @relation(fields: [capabilityId], references: [id], onDelete: Cascade)

  @@index([capabilityId, locationTag, assessedAt])
}

model CapabilityKPIMaturityCeiling {
  id               String  @id @default(cuid())
  capabilityId     String
  kpiId            String
  maturityLevel    Int
  targetCeilingMin Float?
  targetCeilingMax Float?
  valueToNextLevel Float?
  notes            String?

  capability Capability @relation(fields: [capabilityId], references: [id], onDelete: Cascade)
  kpi        KPI        @relation(fields: [kpiId], references: [id], onDelete: Cascade)

  @@unique([capabilityId, kpiId, maturityLevel])
}
```

Modify the `Capability` model — add to its relation block (after `projects ProjectCapability[]`):
```prisma
  maturityAssessments MaturityAssessment[]
  kpiCeilings          CapabilityKPIMaturityCeiling[]
```

Modify the `KPI` model — add to its relation block (after `capabilities CapabilityKPI[]`):
```prisma
  capabilityCeilings CapabilityKPIMaturityCeiling[]
```

- [ ] **Step 4: Create and apply the migration**

Run: `npx prisma migrate dev --name add_maturity_models`
Expected: `Your database is now in sync with your schema.`

- [ ] **Step 5: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: `app/generated/prisma/models/MaturityAssessment.ts` and `CapabilityKPIMaturityCeiling.ts` are created.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- maturity`
Expected: PASS (1 test).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations app/generated/prisma tests/schema/maturity.test.ts
git commit -m "Add MaturityAssessment and CapabilityKPIMaturityCeiling models"
```

---

### Task 5: Dependency & conflict models — `Dependency`, `ConflictFlag`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `tests/schema/dependency-conflict.test.ts`

**Interfaces:**
- Consumes: `prisma`, `createTestOrganization`, `cleanupOrganization` from Task 1; `TagTargetType` enum from Task 3 (reused, not redefined).
- Produces: Prisma models `Dependency` (fields: `id`, `type: DependencyType`, `sourceType: TagTargetType`, `sourceId`, `targetType: TagTargetType`, `targetId`, `description?`, `createdAt`) and `ConflictFlag` (fields: `id`, `entityType: TagTargetType`, `entityId`, `status: ConflictStatus`, `claims: Json`, `resolution?`, `resolvedBy?`, `resolvedAt?`, `createdAt`), via `prisma.dependency` / `prisma.conflictFlag`. Both are standalone (no Prisma relations) since `sourceId`/`targetId`/`entityId` are polymorphic references resolved by `sourceType`/`targetType`/`entityType` at the application layer, not the DB layer.

- [ ] **Step 1: Write the failing test**

Create `tests/schema/dependency-conflict.test.ts`:
```typescript
import { afterAll, describe, expect, it } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

describe("dependency and conflict models", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("records a cross-domain dependency and a stakeholder conflict flag", async () => {
    const org = await createTestOrganization({ name: "Dependency Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({
      data: { organizationId: org.id, name: "Technology & Data" },
    });
    const crmCapability = await prisma.capability.create({
      data: { domainId: domain.id, name: "CRM Data Accuracy" },
    });
    const salesKpi = await prisma.kPI.create({
      data: { organizationId: org.id, name: "Quarterly Sales Target" },
    });

    const dependency = await prisma.dependency.create({
      data: {
        type: "CAPABILITY_TO_KPI",
        sourceType: "CAPABILITY",
        sourceId: crmCapability.id,
        targetType: "KPI",
        targetId: salesKpi.id,
        description: "CRM data accuracy cascades into quarterly finance targets",
      },
    });
    expect(dependency.description).toContain("cascades");

    const conflict = await prisma.conflictFlag.create({
      data: {
        entityType: "CAPABILITY",
        entityId: crmCapability.id,
        claims: [
          { stakeholderId: "s1", segmentId: "seg1", statement: "Inventory tracking is fine" },
          { stakeholderId: "s2", segmentId: "seg2", statement: "PO reconciliation is broken" },
        ],
      },
    });
    expect(conflict.status).toBe("OPEN");
    expect(Array.isArray(conflict.claims)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- dependency-conflict`
Expected: FAIL — `Property 'dependency' does not exist on type 'PrismaClient'`.

- [ ] **Step 3: Add the schema**

In `prisma/schema.prisma`, add after the `CapabilityKPIMaturityCeiling` model:
```prisma
enum DependencyType {
  CAPABILITY_TO_KPI
  KPI_TO_KPI
  CAPABILITY_TO_CAPABILITY
}

model Dependency {
  id          String         @id @default(cuid())
  type        DependencyType
  sourceType  TagTargetType
  sourceId    String
  targetType  TagTargetType
  targetId    String
  description String?
  createdAt   DateTime       @default(now())

  @@index([sourceType, sourceId])
  @@index([targetType, targetId])
}

enum ConflictStatus {
  OPEN
  RESOLVED
}

model ConflictFlag {
  id         String         @id @default(cuid())
  entityType TagTargetType
  entityId   String
  status     ConflictStatus @default(OPEN)
  claims     Json
  resolution String?
  resolvedBy String?
  resolvedAt DateTime?
  createdAt  DateTime       @default(now())

  @@index([entityType, entityId])
}
```

- [ ] **Step 4: Create and apply the migration**

Run: `npx prisma migrate dev --name add_dependency_conflict_models`
Expected: `Your database is now in sync with your schema.`

- [ ] **Step 5: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: `app/generated/prisma/models/Dependency.ts` and `ConflictFlag.ts` are created.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- dependency-conflict`
Expected: PASS (1 test).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations app/generated/prisma tests/schema/dependency-conflict.test.ts
git commit -m "Add Dependency and ConflictFlag models for cross-domain chains and stakeholder conflicts"
```

---

### Task 6: Recommendation models — `Recommendation`, `RecommendationFeedback`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `tests/schema/recommendation.test.ts`

**Interfaces:**
- Consumes: `prisma`, `createTestOrganization`, `cleanupOrganization` from Task 1.
- Produces: Prisma models `Recommendation` (fields: `id`, `organizationId`, `title`, `description`, `relatedCapabilityIds: String[]`, `relatedKPIIds: String[]`, `estimatedValue?`, `priorityScore?`, `status: RecommendationStatus`, `reviewedBy?`, `reviewNotes?`, `createdAt`, `updatedAt`) and `RecommendationFeedback` (fields: `id`, `recommendationId`, `action`, `originalFields?: Json`, `editedFields?: Json`, `reason?`, `actedBy?`, `actedAt`), via `prisma.recommendation` / `prisma.recommendationFeedback`.

- [ ] **Step 1: Write the failing test**

Create `tests/schema/recommendation.test.ts`:
```typescript
import { afterAll, describe, expect, it } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

describe("recommendation models", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("drafts a recommendation, edits it, and logs the feedback", async () => {
    const org = await createTestOrganization({ name: "Recommendation Test Org" });
    orgId = org.id;

    const recommendation = await prisma.recommendation.create({
      data: {
        organizationId: org.id,
        title: "Digitize extrusion process tracking at Brampton",
        description: "Move from manual logs to a digital tracking system.",
        relatedCapabilityIds: ["cap-1"],
        relatedKPIIds: ["kpi-1"],
        estimatedValue: 250000,
        status: "DRAFT",
      },
    });
    expect(recommendation.status).toBe("DRAFT");

    const edited = await prisma.recommendation.update({
      where: { id: recommendation.id },
      data: { status: "EDITED", estimatedValue: 200000 },
    });

    const feedback = await prisma.recommendationFeedback.create({
      data: {
        recommendationId: recommendation.id,
        action: "edited",
        originalFields: { estimatedValue: 250000 },
        editedFields: { estimatedValue: 200000 },
        reason: "Advisor judged the original estimate too optimistic",
        actedBy: "advisor-1",
      },
    });

    expect(edited.estimatedValue).toBe(200000);
    expect(feedback.action).toBe("edited");

    const withFeedback = await prisma.recommendation.findUniqueOrThrow({
      where: { id: recommendation.id },
      include: { feedback: true },
    });
    expect(withFeedback.feedback).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- recommendation`
Expected: FAIL — `Property 'recommendation' does not exist on type 'PrismaClient'`.

- [ ] **Step 3: Add the schema**

In `prisma/schema.prisma`, add after the `ConflictFlag` model:
```prisma
enum RecommendationStatus {
  DRAFT
  PENDING_REVIEW
  APPROVED
  REJECTED
  EDITED
}

model Recommendation {
  id                    String                @id @default(cuid())
  organizationId        String
  title                 String
  description           String
  relatedCapabilityIds  String[]
  relatedKPIIds         String[]
  estimatedValue        Float?
  priorityScore         Float?
  status                RecommendationStatus  @default(DRAFT)
  reviewedBy            String?
  reviewNotes           String?
  createdAt             DateTime              @default(now())
  updatedAt             DateTime              @updatedAt

  organization Organization             @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  feedback     RecommendationFeedback[]
}

model RecommendationFeedback {
  id               String   @id @default(cuid())
  recommendationId String
  action           String
  originalFields   Json?
  editedFields     Json?
  reason           String?
  actedBy          String?
  actedAt          DateTime @default(now())

  recommendation Recommendation @relation(fields: [recommendationId], references: [id], onDelete: Cascade)
}
```

Modify the `Organization` model — add to its relation block (after `capturedInputs CapturedInput[]`):
```prisma
  recommendations Recommendation[]
```

- [ ] **Step 4: Create and apply the migration**

Run: `npx prisma migrate dev --name add_recommendation_models`
Expected: `Your database is now in sync with your schema.`

- [ ] **Step 5: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: `app/generated/prisma/models/Recommendation.ts` and `RecommendationFeedback.ts` are created.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- recommendation`
Expected: PASS (1 test).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations app/generated/prisma tests/schema/recommendation.test.ts
git commit -m "Add Recommendation and RecommendationFeedback models for the review/learning loop"
```

---

### Task 7: Follow-up suggestion & processing job models

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `tests/schema/followup-job.test.ts`

**Interfaces:**
- Consumes: `prisma`, `createTestOrganization`, `cleanupOrganization` from Task 1; `CapturedSegment` from Task 2.
- Produces: Prisma models `FollowUpSuggestion` (fields: `id`, `sessionId`, `triggerSegmentId?`, `capabilityId?`, `suggestedQuestion`, `status: FollowUpStatus`, `createdAt`) and `ProcessingJob` (fields: `id`, `type`, `targetId`, `status: JobStatus`, `attempts`, `error?`, `createdAt`, `updatedAt`), via `prisma.followUpSuggestion` / `prisma.processingJob`.

- [ ] **Step 1: Write the failing test**

Create `tests/schema/followup-job.test.ts`:
```typescript
import { afterAll, describe, expect, it } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

describe("follow-up suggestion and processing job models", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("generates a live follow-up suggestion tied to a session and segment", async () => {
    const org = await createTestOrganization({ name: "FollowUp Test Org" });
    orgId = org.id;

    const advisor = await prisma.user.create({
      data: { email: `advisor-${Date.now()}@flowstate.test`, role: "ADVISOR" },
    });
    const session = await prisma.assessmentSession.create({
      data: { organizationId: org.id, advisorId: advisor.id, status: "active" },
    });
    const input = await prisma.capturedInput.create({
      data: { organizationId: org.id, sessionId: session.id, type: "AUDIO", status: "TAGGED" },
    });
    const segment = await prisma.capturedSegment.create({
      data: { capturedInputId: input.id, order: 0, text: "We are losing money on night shift." },
    });

    const suggestion = await prisma.followUpSuggestion.create({
      data: {
        sessionId: session.id,
        triggerSegmentId: segment.id,
        suggestedQuestion: "What's driving the night shift labor cost specifically?",
        status: "SHOWN",
      },
    });
    expect(suggestion.status).toBe("SHOWN");

    const withSuggestions = await prisma.assessmentSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { followUpSuggestions: true },
    });
    expect(withSuggestions.followUpSuggestions).toHaveLength(1);
  });

  it("tracks an async processing job through its lifecycle", async () => {
    const job = await prisma.processingJob.create({
      data: { type: "transcribe", targetId: "some-captured-input-id", status: "QUEUED" },
    });
    expect(job.attempts).toBe(0);

    const running = await prisma.processingJob.update({
      where: { id: job.id },
      data: { status: "RUNNING", attempts: { increment: 1 } },
    });
    expect(running.status).toBe("RUNNING");
    expect(running.attempts).toBe(1);

    await prisma.processingJob.delete({ where: { id: job.id } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- followup-job`
Expected: FAIL — `Property 'followUpSuggestion' does not exist on type 'PrismaClient'`.

- [ ] **Step 3: Add the schema**

In `prisma/schema.prisma`, add after the `RecommendationFeedback` model:
```prisma
enum FollowUpStatus {
  SHOWN
  ASKED
  DISMISSED
}

model FollowUpSuggestion {
  id                String         @id @default(cuid())
  sessionId         String
  triggerSegmentId  String?
  capabilityId      String?
  suggestedQuestion String
  status            FollowUpStatus @default(SHOWN)
  createdAt         DateTime       @default(now())

  session        AssessmentSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  triggerSegment CapturedSegment?  @relation(fields: [triggerSegmentId], references: [id])
  capability     Capability?       @relation(fields: [capabilityId], references: [id])
}

enum JobStatus {
  QUEUED
  RUNNING
  DONE
  FAILED
}

model ProcessingJob {
  id        String    @id @default(cuid())
  type      String
  targetId  String
  status    JobStatus @default(QUEUED)
  attempts  Int       @default(0)
  error     String?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}
```

Modify the `AssessmentSession` model — add to its relation block (after `capturedInputs CapturedInput[]`):
```prisma
  followUpSuggestions FollowUpSuggestion[]
```

Modify the `CapturedSegment` model — add to its relation block (after `tags Tag[]`):
```prisma
  followUps FollowUpSuggestion[]
```

Modify the `Capability` model — add to its relation block (after `kpiCeilings CapabilityKPIMaturityCeiling[]`):
```prisma
  followUpSuggestions FollowUpSuggestion[]
```

- [ ] **Step 4: Create and apply the migration**

Run: `npx prisma migrate dev --name add_followup_and_job_models`
Expected: `Your database is now in sync with your schema.`

- [ ] **Step 5: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: `app/generated/prisma/models/FollowUpSuggestion.ts` and `ProcessingJob.ts` are created.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- followup-job`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations app/generated/prisma tests/schema/followup-job.test.ts
git commit -m "Add FollowUpSuggestion and ProcessingJob models"
```

---

### Task 8: Seed data for the window/door manufacturer scenario

**Files:**
- Modify: `prisma/seed.ts`

**Interfaces:**
- Consumes: all models from Tasks 2–7, plus the existing `Organization`/`BusinessDomain`/`Capability`/`KPI`/`Stakeholder` models.
- Produces: nothing consumed by later tasks in this plan — this is a leaf task. Running `npm run db:seed` populates the dev database with a realistic scenario for manual review and for Phase 2/3 development against real-shaped data.

- [ ] **Step 1: Replace the seed script contents**

Modify `prisma/seed.ts` — replace the entire `main()` function body (the file's `require`/`pool`/`adapter` setup at the top stays unchanged):

```typescript
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
```

- [ ] **Step 2: Run the seed script**

Run: `npm run db:seed`
Expected: `Seeded org: Window & Door Manufacturing Co. (<cuid>)` printed with no errors.

- [ ] **Step 3: Spot-check the seeded data**

Run:
```bash
node -e "
require('dotenv/config');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const { PrismaClient } = require('./app/generated/prisma/client');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
prisma.maturityAssessment.findMany({ include: { capability: true } }).then(rows => {
  console.log(rows.map(r => \`\${r.capability.name} @ \${r.locationTag}: \${r.score}\`));
  pool.end();
});
"
```
Expected output includes both `Extrusion Process Control @ Brampton: 2` and `CRM Data Accuracy @ Alexandria: 3`.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "Seed window/door manufacturer scenario across Alexandria and Brampton"
```

---

### Task 9: Current-maturity read helper

**Files:**
- Create: `lib/maturity/current.ts`
- Create: `tests/schema/current-maturity.test.ts`

**Interfaces:**
- Consumes: `prisma` from `lib/db` (the app's existing singleton, not the test helper — this is application code, not test code); `MaturityAssessment` from Task 4.
- Produces: `getCurrentMaturity(capabilityId: string): Promise<Array<{ locationTag: string | null; score: number; assessedAt: Date }>>` — exported from `lib/maturity/current.ts`. This is the function Phase 3's gap-analysis and report views will call; it is the concrete implementation of the "current maturity is always computed by reading the latest MaturityAssessment, grouped by locationTag" rule from the design spec (§4.3).

- [ ] **Step 1: Write the failing test**

Create `tests/schema/current-maturity.test.ts`:
```typescript
import { afterAll, describe, expect, it } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";
import { getCurrentMaturity } from "../../lib/maturity/current";

describe("getCurrentMaturity", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("returns the latest assessment per location, not older ones", async () => {
    const org = await createTestOrganization({ name: "Current Maturity Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({
      data: { organizationId: org.id, name: "Operations" },
    });
    const capability = await prisma.capability.create({
      data: { domainId: domain.id, name: "Extrusion Process Control" },
    });

    await prisma.maturityAssessment.create({
      data: { capabilityId: capability.id, locationTag: "Brampton", score: 1, assessedAt: new Date("2026-01-01") },
    });
    await prisma.maturityAssessment.create({
      data: { capabilityId: capability.id, locationTag: "Brampton", score: 2, assessedAt: new Date("2026-03-01") },
    });
    await prisma.maturityAssessment.create({
      data: { capabilityId: capability.id, locationTag: "Alexandria", score: 4, assessedAt: new Date("2026-02-01") },
    });

    const current = await getCurrentMaturity(capability.id);

    expect(current).toHaveLength(2);
    const brampton = current.find((c) => c.locationTag === "Brampton");
    const alexandria = current.find((c) => c.locationTag === "Alexandria");
    expect(brampton?.score).toBe(2);
    expect(alexandria?.score).toBe(4);
  });

  it("returns an empty array when a capability has never been assessed", async () => {
    const org = await createTestOrganization({ name: "Unassessed Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({
      data: { organizationId: org.id, name: "Operations" },
    });
    const capability = await prisma.capability.create({
      data: { domainId: domain.id, name: "Untouched Capability" },
    });

    const current = await getCurrentMaturity(capability.id);
    expect(current).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- current-maturity`
Expected: FAIL — `Cannot find module '../../lib/maturity/current'`.

- [ ] **Step 3: Write the implementation**

Create `lib/maturity/current.ts`:
```typescript
import { prisma } from "@/lib/db";

export type CurrentMaturity = {
  locationTag: string | null;
  score: number;
  assessedAt: Date;
};

export async function getCurrentMaturity(capabilityId: string): Promise<CurrentMaturity[]> {
  const rows = await prisma.maturityAssessment.findMany({
    where: { capabilityId },
    orderBy: { assessedAt: "desc" },
  });

  const latestByLocation = new Map<string | null, CurrentMaturity>();
  for (const row of rows) {
    if (!latestByLocation.has(row.locationTag)) {
      latestByLocation.set(row.locationTag, {
        locationTag: row.locationTag,
        score: row.score,
        assessedAt: row.assessedAt,
      });
    }
  }

  return Array.from(latestByLocation.values());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- current-maturity`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all test files pass (Tasks 1–9 combined): `smoke`, `ingestion`, `tagging`, `maturity`, `dependency-conflict`, `recommendation`, `followup-job`, `current-maturity`.

- [ ] **Step 6: Commit**

```bash
git add lib/maturity/current.ts tests/schema/current-maturity.test.ts
git commit -m "Add getCurrentMaturity helper computing current state from assessment history"
```

---

## Definition of Done for this Plan

- `npm test` passes with all 9 test files green.
- `npx prisma migrate status` reports the database in sync with the schema.
- `npm run db:seed` populates the window/door manufacturer scenario without error.
- `npm run build` still succeeds (proves this plan did not break the existing app, per the Global Constraints note on deferring the `asIsScore`/`toBeScore` removal to Phase 3).
