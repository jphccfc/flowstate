# Flow State Phase 2b — Live Session Mode Design Spec

Date: 2026-08-10
Status: Draft, pending user review

## 1. Context

Phase 2 of the Flow State rebuild splits into 2a (batch ingestion pipeline —
capture → transcribe/extract → segment → tag → review; done, merged as two
plans) and 2b (this spec): real-time follow-up question suggestions during
an active interview session, as originally called for in the master design
spec (`docs/superpowers/specs/2026-08-06-flowstate-rebuild-design.md` §5,
step 5) and the rebuild goal prompt's "adaptive interview experience"
requirement.

The `AssessmentSession` and `FollowUpSuggestion` models already exist in the
schema (from the Phase 1 data-model plan) and are unused until now —
`CapturedInput.sessionId` was anticipated for exactly this purpose.

## 2. Scope

- **Live input is typed text only.** The advisor types notes during the
  conversation and submits each chunk (e.g. per paragraph/pause) via a text
  box. No audio streaming, no browser microphone capture — that would be a
  significant new subsystem (partial-transcript handling, streaming
  transcription) out of proportion to this slice. Reuses the exact same
  segment/tag pipeline built in Plan 1, just triggered incrementally per
  chunk instead of once per full document.
- **Suggestion delivery is polling**, matching the pattern already used
  throughout the app (the capture page already polls status every 3s). No
  SSE/WebSocket — not needed at a few-seconds latency for a typing-paced
  conversation, and would introduce a persistent-connection pattern used
  nowhere else in this app.

## 3. Session lifecycle

Reuses `AssessmentSession` (`organizationId`, `advisorId`, `name`, `status`,
`notes`, `completedAt` — all pre-existing fields, no schema change). A
"Start Live Session" action (button on the existing capture page) creates
one with `status: "active"` and navigates to the session page. Ending a
session sets `status: "completed"` and `completedAt: now()`. Once a session
is not `"active"`, its page renders read-only — the feed and past
suggestions are visible, but the input box and suggestion actions are
hidden.

## 4. Capture reuse, not duplication

Each typed chunk becomes its own `CapturedInput` via the **existing**
`POST /api/captured-inputs` route from Plan 1/2, extended to accept an
optional `sessionId` field. When `sessionId` is present:
- `type` is forced to `"TEXT_NOTE"` server-side (live sessions are
  text-only per §2 — the field is redundant with the type restriction but
  kept explicit for clarity and future-proofing if other live input types
  are ever added).
- The `CapturedInput.sessionId` foreign key is set, linking it to the
  session.

No new capture endpoint. The fire-and-forget `after()` pipeline trigger is
unchanged from Plan 1 — this is purely an additive field on the existing
request/response contract.

## 5. Pipeline extension

After the existing tag step completes (Plan 1's `runJob("tag", ...)`), a
new conditional step runs **only when `input.sessionId` is set**:

1. Query every `Tag` with `status` in (`AUTO_APPROVED`, `APPROVED`) whose
   segment belongs to a `CapturedInput` with this `sessionId` — this is
   "the capability areas touched so far in this session." Resolve each
   tag's `targetId`/`targetType` to a display name (same lookup pattern
   `getTaggableEntities`/the tags API route already use).
2. Call `generateFollowUpSuggestions(latestSegmentText, touchedAreaNames)`
   — a new Claude call (`lib/ai/followups.ts`), given the just-tagged
   segment's text and the accumulated area names, returning 1-3 suggested
   follow-up question strings.
3. Create one `FollowUpSuggestion` row per returned question
   (`sessionId`, `triggerSegmentId` = the segment that prompted it,
   `capabilityId` = null (see §10 — not populated in this pass),
   `suggestedQuestion`, `status: "SHOWN"`).

This step is wrapped in the same `runJob("suggest_followups", ...)`
tracking pattern as `transcribe`/`segment`/`tag`, so it gets the same
`ProcessingJob` status visibility and FAILED-path error handling. A failure
in this step does **not** fail the whole `CapturedInput` — the segment/tag
work is already done and valuable on its own; a failed suggestion
generation is logged (`ProcessingJob` row `FAILED`) but does not flip
`CapturedInput.status` to `FAILED`. This is the one deliberate deviation
from Plan 1/2's error-handling pattern, because unlike segmenting/tagging,
follow-up suggestions are a bonus on top of already-successful capture, not
a required step in the chain.

## 6. API surface

- `POST /api/sessions` — body `{ organizationId }` → creates
  `AssessmentSession(status: "active")`, returns it.
- `GET /api/sessions/[id]` — session detail plus its `CapturedInput`s
  (each with segments/tags) for the running feed.
- `PATCH /api/sessions/[id]` — body `{ action: "end" }` → sets
  `status: "completed"`, `completedAt: now()`.
- `GET /api/sessions/[id]/suggestions` — `FollowUpSuggestion` rows with
  `status: "SHOWN"` for this session, newest first.
- `PATCH /api/suggestions/[id]` — body `{ action: "ask" | "dismiss" }` →
  sets `status` to `"ASKED"`/`"DISMISSED"`.
- `POST /api/captured-inputs` (Plan 1/2, extended) — now accepts an
  optional `sessionId` field.

All routes follow the existing auth-check pattern exactly
(`@/lib/db`, `@/lib/supabase/server`, 401 before anything else).

## 7. UI

`app/clients/[id]/session/[sessionId]/page.tsx` — a single page with:
- A running feed of submitted `CapturedInput`s for this session (text +
  resolved tag names once tagged), newest at the bottom.
- A textbox + submit button (hidden when the session is not active).
- A suggestions panel, polling `GET /api/sessions/[id]/suggestions` every
  few seconds, each suggestion showing the question with Ask/Dismiss
  buttons (hidden when the session is not active — past suggestions still
  visible, read-only).
- An "End Session" button while active.

Matches the existing raw-Tailwind + CSS-variable convention used
throughout the app (no shadcn).

## 8. New Claude call

`lib/ai/followups.ts`:
```
generateFollowUpSuggestions(
  latestSegmentText: string,
  touchedAreaNames: string[]
): Promise<string[]>
```
Same raw-`fetch`-to-Anthropic pattern as `lib/ai/tagging.ts` — no new SDK
dependency. Prompt: given the just-captured segment and the list of
capability/domain/KPI/stakeholder areas already touched in this session,
suggest 1-3 specific, non-redundant follow-up questions the advisor could
ask next. Returns `[]` if nothing useful to suggest (e.g., the segment is
off-topic small talk) — this is a valid, expected outcome, not an error.

## 9. Testing

Same conventions as Plans 1-2: integration tests against the real Supabase
Postgres database (no DB mocks) for session lifecycle, the pipeline
extension, and the suggestions/session API routes. The new Claude call is
mocked at `fetch`, consistent with `tagging.ts`'s test approach. No
automated UI tests (matches existing practice — verified manually via
`npm run dev`/`npm run build`).

## 10. Open questions / risks

- **`capabilityId` on `FollowUpSuggestion`** is left null in the initial
  implementation (§5, step 3) — reliably inferring "this suggestion is
  about capability X specifically" from a free-text Claude suggestion is
  a harder problem than generating the suggestion itself, and the field is
  nullable in the schema precisely because it's optional context, not a
  hard requirement. Can be added later if useful for filtering/reporting.
- **No dedup between suggestions** — if the advisor ignores a suggestion
  and the same topic comes up again in a later chunk, Claude may suggest
  a near-duplicate question. Not addressed in this pass; would need
  either prompt-level "don't repeat these" context (feeding prior
  suggestions back in) or post-hoc similarity filtering. Deferred as a
  refinement, not blocking a working first version.
- **Auto-tag confidence threshold (0.85)**, inherited from Plan 1, applies
  unchanged to segments captured in live sessions — same untuned-threshold
  caveat as before.
