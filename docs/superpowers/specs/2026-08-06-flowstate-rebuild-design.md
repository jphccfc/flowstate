# Flow State Platform Rebuild — Design Spec

Date: 2026-08-06
Status: Draft, pending user review

## 1. Context

Flow State Partners runs growth advisory engagements. The methodology: interview
stakeholders, assess capability maturity (0–5) across people/process/systems,
map maturity against KPI targets, surface gaps, quantify the financial impact of
closing them, and generate reviewable recommendations. Every assessment and human
correction should feed a learning loop so the platform improves across engagements.

This is a rebuild, not an incremental add, driven by
`flowstate-rebuild-goal-prompt.md` (source doc, provided by the user). There is
no separate prior `claude.md` domain spec beyond what already exists in the
`flowstate` repo — the reusable material is the Phase 1 code already committed
there (see §2).

**Phase 1 proof-of-concept scenario:** a window & door manufacturer in due
diligence, two locations (Alexandria, Brampton) with different systems and
processes (Brampton includes extrusion), assessed as one unified business, not
as separate per-location assessments. Single-tenant, single-advisor use — no
multi-tenant abstraction needed yet, but the model shouldn't preclude it later.

## 2. What's reused vs. rebuilt

**Reused as-is** (already in the repo, Prisma schema + app code):
- `Organization`, `BusinessDomain`, `Capability`, `KPI`/`CapabilityKPI`,
  `Stakeholder`, `Process`, `Technology`, `Project`, `Achievement`,
  `User`/`UserOrganization` (roles), `AssessmentSession`.
- Supabase auth/middleware, the domain→capability→KPI/process/technology
  relational shape, the `lib/scoring/engine.ts` gap-severity/domain-score math
  (extended, not replaced), the `lib/ai` provider abstraction pattern (Claude +
  OpenAI, selected via `AI_PROVIDER` env var).

**Rebuilt / net-new:**
- Everything related to raw input capture, transcription, segment-level tagging
  with confidence scoring and human review.
- Maturity as a versioned assessment history instead of mutable fields on
  `Capability`.
- Maturity-to-target-ceiling modeling and dollar-value quantification.
- Explicit cross-domain dependency chains between capabilities/KPIs.
- Conflict flagging between stakeholder inputs.
- A recommendation object with approval/edit/reject state and structured
  outcome/feedback capture (the learning-loop data layer).
- Live, in-session follow-up question suggestions.

## 3. Processing architecture

Stay all-in-Next.js on Vercel — no separate worker service for Phase 1.
Ingestion (transcription, tagging, follow-up suggestion generation) runs as
async background work triggered from API routes, tracked through a
`ProcessingJob` queue table, executed via Vercel Fluid Compute functions (300s
timeout covers per-segment Whisper/Claude calls). A decoupled worker
(Fly.io/Railway-style) would handle higher audio volume more robustly, but is
unnecessary infrastructure for a single-client, single-advisor Phase 1, and
nothing in the data model below depends on where processing physically runs —
this can migrate later without a schema change.

Transcription provider: **OpenAI Whisper API**, added to the existing
`lib/ai` provider pattern as a new capability (`transcribe(audioFile): Promise<string>`)
rather than a new abstraction layer.

## 4. Data model

### 4.1 Location handling

Per user decision: **no first-class `Location` model.** Site-specificity
(Alexandria / Brampton / org-wide) is expressed as a `locationTag: String?`
field on the records where it matters: `CapturedInput`, `MaturityAssessment`,
and optionally `Stakeholder`/`Process`/`Technology`. `null` means org-wide or
shared. This is enforced at the application layer (a small constant list), not
via DB referential integrity. `Capability` and `KPI` definitions themselves
stay org-level — only the assessment/evidence layer is location-scoped, which
is what lets "Brampton extrusion process" and "Alexandria" coexist inside one
unified business assessment.

Trade-off accepted knowingly: no FK integrity on location, and "give me
everything for Brampton" queries filter on a string field rather than a
relation. Acceptable at Phase 1 scale (two known locations, one client).

### 4.2 New models

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
  sessionId      String?           // link to AssessmentSession if captured live
  type           InputType
  sourceRef      String?           // file path / URL / email message id
  rawText        String?           // transcript or extracted text
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
  id             String   @id @default(cuid())
  capturedInputId String
  order          Int
  speaker        String?          // best-effort, from diarization or manual note
  text           String
  startMs        Int?             // audio offset, if applicable
  endMs          Int?
  createdAt      DateTime @default(now())

  capturedInput CapturedInput      @relation(fields: [capturedInputId], references: [id], onDelete: Cascade)
  tags          Tag[]
  followUps     FollowUpSuggestion[]
}

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
  id          String        @id @default(cuid())
  segmentId   String
  targetType  TagTargetType
  targetId    String        // id of BusinessDomain | Capability | KPI | Stakeholder
  confidence  Float
  status      TagStatus     @default(PENDING_REVIEW)
  reviewedBy  String?
  reviewedAt  DateTime?
  createdAt   DateTime      @default(now())

  segment CapturedSegment @relation(fields: [segmentId], references: [id], onDelete: Cascade)

  @@index([targetType, targetId])
}

model MaturityAssessment {
  id           String   @id @default(cuid())
  capabilityId String
  locationTag  String?
  score        Int      // 0-5
  evidence     String?
  sourceSegmentIds String[]
  assessedBy   String?  // userId
  assessedAt   DateTime @default(now())
  createdAt    DateTime @default(now())

  capability Capability @relation(fields: [capabilityId], references: [id], onDelete: Cascade)

  @@index([capabilityId, locationTag, assessedAt])
}

model CapabilityKPIMaturityCeiling {
  id            String @id @default(cuid())
  capabilityId  String
  kpiId         String
  maturityLevel Int    // 0-5
  targetCeilingMin Float?  // achievable target range at this maturity level
  targetCeilingMax Float?
  valueToNextLevel Float?  // $ estimate of moving to maturityLevel + 1
  notes         String?

  capability Capability @relation(fields: [capabilityId], references: [id], onDelete: Cascade)
  kpi        KPI        @relation(fields: [kpiId], references: [id], onDelete: Cascade)

  @@unique([capabilityId, kpiId, maturityLevel])
}

enum DependencyType {
  CAPABILITY_TO_KPI
  KPI_TO_KPI
  CAPABILITY_TO_CAPABILITY
}

model Dependency {
  id           String         @id @default(cuid())
  type         DependencyType
  sourceType   TagTargetType  // reuse enum: CAPABILITY or KPI
  sourceId     String
  targetType   TagTargetType
  targetId     String
  description  String?        // e.g. "CRM data accuracy cascades into quarterly finance targets"
  createdAt    DateTime       @default(now())

  @@index([sourceType, sourceId])
  @@index([targetType, targetId])
}

enum ConflictStatus {
  OPEN
  RESOLVED
}

model ConflictFlag {
  id           String          @id @default(cuid())
  entityType   TagTargetType
  entityId     String
  status       ConflictStatus  @default(OPEN)
  claims       Json            // [{ stakeholderId, segmentId, statement }]
  resolution   String?
  resolvedBy   String?
  resolvedAt   DateTime?
  createdAt    DateTime        @default(now())

  @@index([entityType, entityId])
}

enum RecommendationStatus {
  DRAFT
  PENDING_REVIEW
  APPROVED
  REJECTED
  EDITED
}

model Recommendation {
  id                  String                @id @default(cuid())
  organizationId      String
  title               String
  description         String
  relatedCapabilityIds String[]
  relatedKPIIds       String[]
  estimatedValue      Float?
  priorityScore       Float?
  status              RecommendationStatus  @default(DRAFT)
  reviewedBy          String?
  reviewNotes         String?
  createdAt           DateTime              @default(now())
  updatedAt           DateTime              @updatedAt

  organization Organization           @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  feedback     RecommendationFeedback[]
}

model RecommendationFeedback {
  id               String   @id @default(cuid())
  recommendationId String
  action           String   // "approved" | "rejected" | "edited"
  originalFields   Json?    // snapshot before edit
  editedFields     Json?    // snapshot after edit
  reason           String?
  actedBy          String?
  actedAt          DateTime @default(now())

  recommendation Recommendation @relation(fields: [recommendationId], references: [id], onDelete: Cascade)
}

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
  id          String    @id @default(cuid())
  type        String    // "transcribe" | "segment" | "tag" | "suggest_followups" | "generate_recommendations"
  targetId    String    // e.g. CapturedInput id
  status      JobStatus @default(QUEUED)
  attempts    Int       @default(0)
  error       String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```

### 4.3 Modifications to existing models

- `Capability`: **drop `asIsScore`/`toBeScore`/`asIsNotes` as the source of
  truth.** A capability can now have multiple current values (one per
  location plus org-wide), so a single cached field can't represent that
  without ambiguity — "current" is always computed by reading the latest
  `MaturityAssessment` per capability, grouped by `locationTag`, at request
  time. The existing fields are removed in the migration rather than kept as
  stale cache. Add relation to `MaturityAssessment[]` and
  `CapabilityKPIMaturityCeiling[]`.
- `AssessmentSession`: add relations to `CapturedInput[]` and
  `FollowUpSuggestion[]` to support the live session mode.
- `Organization`: add relations to `CapturedInput[]` and `Recommendation[]`.

## 5. Pipeline flow

1. **Capture** — advisor uploads/records via the app; a `CapturedInput` row is
   created (`status: PENDING`), tagged with `locationTag` if site-specific.
2. **Transcribe** — if `type: AUDIO`, a `ProcessingJob(type: transcribe)` sends
   the file to Whisper; result written to `rawText`, status →`TRANSCRIBED`.
   Non-audio inputs skip straight to segmenting with their existing text.
3. **Segment** — `rawText` is chunked into `CapturedSegment`s (paragraph or
   conversational-turn boundaries; Claude-assisted for messy transcripts).
4. **Tag** — each segment is sent to Claude for structured tag suggestions
   (domain/capability/KPI/stakeholder) with confidence scores. Tags
   `>= 0.85` confidence auto-approve (`AUTO_APPROVED`); below that threshold
   they land in `PENDING_REVIEW` for a human operator to approve, reject, or
   reassign in a review UI. Reviewer actions update `status`/`reviewedBy`.
5. **Live session mode** — when a `CapturedInput` is linked to an active
   `AssessmentSession`, steps 3–4 run incrementally per segment as it arrives
   (not batched at the end), and a parallel `ProcessingJob(type:
   suggest_followups)` runs a focused Claude call using the capability areas
   touched so far plus what's already known about them, producing
   `FollowUpSuggestion` rows the UI surfaces to the advisor in real time.
6. **Assess** — a human (or a Claude-assisted draft the human confirms) turns
   approved tags + evidence into a `MaturityAssessment` row per
   capability(+location). There is no denormalized field to update — "current
   maturity" for a capability is always computed by reading the latest
   `MaturityAssessment` row(s) at request time (§4.3).
7. **Gap analysis** reads the latest `MaturityAssessment` per
   capability(+location), looks up `CapabilityKPIMaturityCeiling` for the
   corresponding KPI to compute the achievable-target range and the dollar
   value of closing to the next level, and walks `Dependency` rows to trace
   cross-domain cascades (e.g., a Capability→KPI dependency into a KPI→KPI
   dependency) into a causal chain view.
8. **Conflict detection** — during tagging/assessment, if two segments from
   different stakeholders produce contradictory claims about the same
   capability/KPI (divergent state description or maturity estimate), a
   `ConflictFlag` is created instead of auto-resolving. Detection is a
   Claude-assisted comparison pass over same-target tags/assessments, not a
   pure numeric diff (since claims are often qualitative).
9. **Recommendations** — a Claude call drafts `Recommendation` rows from the
   gap-analysis + dependency-chain output (status `DRAFT`). A human reviews
   each in a UI: approve, reject, or edit. Every action writes a
   `RecommendationFeedback` row capturing before/after state and a reason —
   this is the Phase 1 learning-loop data capture the spec requires (no
   trained learning model yet, just structured capture from day one).

## 6. Gap analysis logic (extends `lib/scoring/engine.ts`)

The existing `calculateGap`/`calculateDomainScore`/`getGapSeverity` functions
are kept and extended, not replaced:

- `calculateGap` becomes maturity-aware: gap is computed between the latest
  `MaturityAssessment.score` and the KPI-driven target maturity level (not a
  free-floating `toBeScore`).
- New: `getAchievableCeiling(capabilityId, kpiId, currentMaturity)` — looks up
  `CapabilityKPIMaturityCeiling` for the row matching current maturity level,
  returns the achievable target range and `valueToNextLevel`.
- New: `traceDependencyChain(capabilityId | kpiId)` — walks `Dependency` rows
  to build the causal chain (capability gap → KPI shortfall → dependent KPI
  impact → dollar value) for display in the analysis/report views.

## 7. Phasing (build order)

Per the goal prompt's own instruction, build and check in after each phase:

1. **Data model** — schema above, migrations, seed data for the window/door
   manufacturer scenario (Alexandria + Brampton).
2. **Ingestion & tagging** — capture endpoints, Whisper integration,
   segmenting, Claude tagging with confidence, review UI, live-session
   follow-up suggestions.
3. **Assessment & gap analysis** — `MaturityAssessment` creation flow
   (human-entered and Claude-assisted-from-tags), ceiling table admin/seed UI,
   extended scoring engine, causal chain view.
4. **Recommendations** — draft generation, review UI (approve/reject/edit),
   `RecommendationFeedback` capture.

Conflict flagging (§5 step 8) is built alongside phase 2 (it's a tagging-time
concern) but surfaced for reconciliation in phase 3's UI.

## 8. Open questions / risks (flagged, not blocking)

- **Multi-location display**: when both an org-wide and a location-specific
  `MaturityAssessment` exist for the same capability, the UI shows both side
  by side (e.g., "Alexandria: 3, Brampton: 2, Org-wide: —") rather than
  collapsing to one number — this falls out naturally from computing
  "current" at read time (§4.3) but the exact report/analysis view layout for
  this is left to phase 3 implementation, not specified here.
- **Auto-tag confidence threshold (0.85)** is a starting guess, not a
  calibrated number — expect to tune after seeing real interview transcripts.
- **Conflict detection heuristic** (Claude-assisted comparison) will need
  real transcripts to validate; false positives (flagging non-conflicts) are
  the safer failure mode than false negatives.
- **`locationTag` as a free string** (per the accepted trade-off in §4.1)
  means typos create silent data fragmentation (e.g., "Brampton" vs
  "brampton"). Mitigate with an app-level constant list/enum-like validation,
  not a DB constraint.

## 9. Testing

- Unit tests for scoring engine extensions (`getAchievableCeiling`,
  `traceDependencyChain`, maturity-aware `calculateGap`).
- Integration test for the full ingestion pipeline: capture → transcribe
  (mocked Whisper) → segment → tag (mocked Claude) → review → assessment.
- Seed-data-driven test for the window/door manufacturer scenario covering
  both locations in one unified assessment.
