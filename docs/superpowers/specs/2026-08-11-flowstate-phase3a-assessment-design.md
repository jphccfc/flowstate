# Flow State Phase 3a: Assessment Flow — Design Spec

Date: 2026-08-11
Status: Approved, pending write-up review

## 1. Context

This is the first half of Phase 3 ("Assessment & gap analysis") from the master
rebuild spec (`docs/superpowers/specs/2026-08-06-flowstate-rebuild-design.md`,
§7). Phase 3 splits into two independently shippable sub-phases, mirroring the
master spec's own step 6 (Assess) vs. step 7 (Gap analysis) distinction:

- **3a (this spec)**: recording as-is and to-be maturity scores per capability,
  replacing the legacy 0–10 slider-based assess/analysis/report pages.
- **3b (future)**: `CapabilityKPIMaturityCeiling` admin/seed UI,
  `getAchievableCeiling`/`traceDependencyChain`, dollar-value quantification,
  causal chain view.

**Key discovery driving this spec:** the existing `app/clients/[id]/assess/page.tsx`,
`analysis/page.tsx`, and `report/page.tsx` are pre-rebuild pages that read/write
`Capability.asIsScore`/`toBeScore` directly on a 0–10 scale. The master spec's
`MaturityAssessment` model (0–5 scale, versioned history, location-scoped) was
added to the schema in Phase 1 but has no write path or UI yet — these fields
and pages are still on the old model. Phase 3a replaces them.

**Revision to the master spec's original design:** the master spec assumed
"to-be" targets would be purely derived from KPI-driven ceiling data (3b's
scope), with no explicit to-be capture in 3a. In practice, initial to-be
targets need to be captured from the outset — a stakeholder-committed target
is the starting focus of an engagement, and it evolves over time as KPI data
becomes available. Growth engagements generally have understood target KPIs;
acquisition recovery or liquidation engagements have an explicit target driven
by deal intent, independent of any KPI ceiling math. This spec adds a
`TargetMaturity` model to capture this from day one; 3b's KPI ceiling logic
becomes a refinement on top of an already-tracked target, not its origin.

## 2. Scope

**In scope:**
- `TargetMaturity` model and `Organization.engagementMotive` field.
- `Capability` migration: drop `asIsScore`/`toBeScore`/`gapScore`/`asIsState`/
  `asIsNotes`/`toBeState`/`opportunities`/`weaknesses`; add `tags: String[]`.
- Scoring engine changes: read from `MaturityAssessment`/`TargetMaturity`
  instead of `Capability` fields.
- New API routes for creating as-is/to-be entries, fetching assessment
  history, and AI-drafting both.
- Full rewrite of `/clients/[id]/assess`, `/analysis`, `/report`.

**Out of scope (deferred to 3b):**
- `CapabilityKPIMaturityCeiling` admin/seed UI.
- `getAchievableCeiling`, `traceDependencyChain`, dollar-value quantification.
- Causal chain view.
- Conflict flagging (deferred from Phase 2, not part of this spec either —
  tracked separately).

## 3. Data Model

```prisma
model TargetMaturity {
  id                String   @id @default(cuid())
  capabilityId      String
  locationTag       String?
  score             Int      // 0-5
  rationale         String?  // why this target — deal motive, stakeholder ask, etc.
  committedBy       String?  // stakeholder name, or "advisor" if provisional
  source            String   @default("manual") // "manual" | "ai_draft"
  sourceSegmentIds  String[] // evidence segments, if AI-assisted
  setBy             String?  // advisor userId who recorded it
  setAt             DateTime @default(now())
  createdAt         DateTime @default(now())

  capability Capability @relation(fields: [capabilityId], references: [id], onDelete: Cascade)

  @@index([capabilityId, locationTag, setAt])
}
```

Mirrors `MaturityAssessment`'s versioned-history shape (new row per change,
latest-per-capability+locationTag wins), kept as a separate model from
`MaturityAssessment` rather than a shared model with a type discriminator —
structurally distinct provenance (`rationale`/`committedBy`/`source` vs.
`evidence`/`sourceSegmentIds`).

**`Organization`** gets one new field:

```prisma
engagementMotive String?  // e.g. "Growth", "Acquisition Recovery", "Liquidation" — free text
```

Surfaced on the client/configure page; factored into the AI to-be drafting
prompt (§5).

**`Capability` migration:**

Drop:
- `asIsScore`, `toBeScore`, `gapScore` — superseded by `MaturityAssessment`/
  `TargetMaturity`, which represent per-location, versioned values a single
  field can't.
- `asIsState`, `asIsNotes` — superseded by `MaturityAssessment.evidence`
  (versioned, location-scoped — strictly more capable than a single static
  field).
- `toBeState` — superseded by `TargetMaturity.rationale`, same reasoning.
- `opportunities`, `weaknesses` — replaced by the new general `tags` field.

Keep: `importanceScore` (static weighting factor, not a historical record —
untouched by the versioning concern) and everything else.

Add:
```prisma
tags String[] @default([])  // free-form: "Strength", "Weakness", "Culture", "Legal", etc.
```

Free-form (not curated/constrained), applied at the `Capability` level only —
not duplicated onto `MaturityAssessment`/`TargetMaturity` rows, since a
capability-level tag already implies the categorization for any assessment
of it; each assessment's own `evidence`/`rationale` text covers what a
specific finding revealed.

**Important nuance carried into design:** not every capability has
location-specific scores. A capability's `locationTag` usage is decided by
the advisor at the moment they record an assessment, not fixed in the schema
— a head-office capability like Sales will only ever have org-wide
(`locationTag: null`) entries, while a plant-specific capability like Process
or Quality may have separate Alexandria/Brampton entries. Nothing in the
model or scoring logic needs to know in advance which capabilities are
location-scoped.

## 4. Scoring Engine (`lib/scoring/engine.ts`)

Moves from reading `Capability.asIsScore`/`toBeScore` directly to reading the
latest `MaturityAssessment`/`TargetMaturity` rows.

**Gap computation per capability+location:** for each location where a
current AS_IS score exists, find the TO_BE score at that same `locationTag`;
if none exists there, fall back to the org-wide (`locationTag: null`) target.

**Domain/radar aggregation:** when a capability has multiple current as-is
scores (e.g., Alexandria: 3, Brampton: 2), it contributes their **average**
to the domain-level radar/report — the same averaging applies independently
to to-be scores, then gap is computed from the two averages. A capability
with only one score (the common case for org-wide-only capabilities)
trivially "averages" to that one value.

```typescript
export type MaturitySnapshot = {
  capabilityId: string;
  locationTag: string | null;
  score: number; // 0-5
};

export function getCurrentAsIs(assessments: MaturitySnapshot[], capabilityId: string): MaturitySnapshot[]
// latest row per (capabilityId, locationTag), filtered to this capability

export function getCurrentToBe(targets: MaturitySnapshot[], capabilityId: string): MaturitySnapshot[]
// same shape, from TargetMaturity

export function calculateGap(asIs: MaturitySnapshot[], toBe: MaturitySnapshot[]): number | null
// averages asIs, averages toBe (with org-wide fallback per location), returns max(0, toBeAvg - asIsAvg)
// returns null if either side has no data

export function calculateDomainScore(capabilities: CapabilityScore[]): DomainScoreResult
// same weighted-by-importanceScore shape as today, fed by the above instead of raw Capability fields
```

`getGapSeverity`, `getGapColor`, `buildRadarData`, `getOverallMaturity` are
unchanged — they already operate on plain numbers, not on `Capability`
directly.

## 5. API Surface

- `POST /api/maturity-assessments` — create an AS_IS entry
  `{ capabilityId, locationTag?, score, evidence?, sourceSegmentIds? }`.
- `POST /api/target-maturities` — create a TO_BE entry
  `{ capabilityId, locationTag?, score, rationale?, committedBy? }`.
- `GET /api/capabilities/[id]/assessment-history` — returns current + full
  history of both AS_IS and TO_BE for one capability.
- `POST /api/capabilities/[id]/draft-as-is` — Claude-assisted draft: gathers
  approved `Tag` evidence for this capability (optionally scoped to a
  `locationTag`), returns a suggested `{ score, evidence }` for the advisor to
  edit before submitting. Raw `fetch` to Claude, matching the established
  `lib/ai/*` pattern — no new SDK.
- `POST /api/capabilities/[id]/draft-to-be` — Claude-assisted draft: uses
  `Organization.engagementMotive`, related `KPI.targetValue`s (via
  `CapabilityKPI`), and existing evidence, returns a suggested
  `{ score, rationale }`.
- `PATCH /api/organizations/[id]` (existing route, extended) — add
  `engagementMotive` to the editable fields.

All routes follow the existing auth-check pattern (`createClient()` →
`getUser()` → 401 first), matching every other route in the app.

## 6. UI

**`/clients/[id]/assess`** (full rewrite): grouped by domain, one panel per
capability showing:
- Capability name, description, tags (chips)
- **As-Is section**: current score per location (e.g. "Alexandria: 3",
  "Brampton: 2", or a single "Org-wide: 4" if no location entries exist) —
  each with a 0-5 picker, evidence textarea, "Draft with AI" button, and an
  expandable "History" toggle showing prior entries with dates
- **To-Be section**: same shape — score(s) per location, rationale textarea,
  committed-by field, "Draft with AI" button, expandable history
- A small gap indicator per location pairing (as-is vs. matched-or-fallback
  to-be), using the existing `getGapSeverity` color scheme

**`/clients/[id]/analysis`** (full rewrite): domain-level radar chart
(current maturity vs. target, per the averaging rule in §4), gap severity
list sorted by domain, using the new engine functions. Where a capability has
more than one location's current score, both are shown side by side in the
capability-level breakdown below the radar rather than collapsed into one
number.

**`/clients/[id]/report`** (full rewrite): domain scores, capability-level
as-is/to-be/gap table with tags and evidence excerpts, matching the existing
report page's general shape but sourced from the new model.

All three keep their current page shells/routing/navigation — this is a
rewrite of their data source and score-entry UI, not a restructuring of the
client section's navigation.

## 7. Testing & Error Handling

- **Scoring engine**: unit tests for `getCurrentAsIs`/`getCurrentToBe`/
  `calculateGap`/`calculateDomainScore` — pure functions, table-driven cases
  covering: single org-wide score, multiple locations, location-specific
  to-be with fallback to org-wide, capability with as-is but no to-be yet
  (gap `null`), capability with neither.
- **API routes**: integration tests against the real Supabase Postgres DB (no
  DB mocks), matching every prior phase's convention. `POST
  /api/maturity-assessments` and `POST /api/target-maturities` get real
  create+read-back tests. The two AI-draft endpoints mock `fetch` and verify
  the prompt is built from real evidence/KPI data, not just that a Claude
  call happens.
- **Error handling**: auth-first (401 before anything else); 400 on missing
  `capabilityId` or invalid `score` (must be an integer 0-5); 404 if
  `capabilityId` doesn't exist. Matches existing route conventions — no new
  cross-cutting error-handling standard introduced in this phase.
- **Migration**: the `Capability` field drop is a real schema migration
  (removing columns), run via `prisma migrate dev` against the real DB and
  verified, never `migrate reset`. No seed data currently populates the
  dropped fields, so no backfill is needed.

## 8. Open Questions / Risks (flagged, not blocking)

- **Tag fragmentation**: free-form `tags` on `Capability` carries the same
  typo/fragmentation risk the master spec already accepted for `locationTag`
  ("Culture" vs. "culture"). Accepted trade-off for now; a curated list can
  be introduced later if it becomes a real problem.
- **To-be revision cadence**: this spec doesn't define when/how often
  advisors are expected to revisit and update a to-be target as KPI data
  evolves (3b's scope) — left as an operational question for advisors, not a
  system-enforced workflow.
- **AI-drafted to-be quality**: `engagementMotive` is a single free-text
  field: how much signal it actually gives Claude for drafting a sensible
  target (vs. a curated set of KPI targets doing most of the work) is
  untested until used against a real engagement.
