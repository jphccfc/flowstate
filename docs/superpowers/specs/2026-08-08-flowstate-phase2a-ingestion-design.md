# Flow State Phase 2a — Batch Ingestion Pipeline Design Spec

Date: 2026-08-08
Status: Draft, pending user review

## 1. Context

This is Phase 2 of the Flow State platform rebuild (see
`docs/superpowers/specs/2026-08-06-flowstate-rebuild-design.md` for the overall
architecture and data model, and `docs/superpowers/plans/2026-08-06-flowstate-data-model.md`
for the Phase 1 data model already built and merged).

Phase 2 as originally scoped ("capture endpoints, Whisper integration,
segmenting, Claude tagging, review UI, live-session follow-up suggestions")
splits into two independent pieces:

- **2a (this spec):** the batch ingestion pipeline — capture → transcribe/
  extract → segment → tag → human review of low-confidence tags.
- **2b (future, separate spec):** live session mode — real-time follow-up
  question suggestions during an active interview. Depends on 2a's tagging
  pipeline running incrementally; brainstormed separately once 2a ships.

## 2. Scope

All 5 `InputType`s are implemented end-to-end in this phase (expanded from
the original design spec's phasing, per user decision):

- **AUDIO** — file upload, transcribed via Whisper.
- **DOCUMENT** / **DATA_ROOM_FILE** — file upload (PDF or DOCX), text
  extracted at upload time. Same technical pipeline for both; they're
  distinguished only by which `type` the advisor selects, not by different
  processing.
- **TEXT_NOTE** — pasted directly, no extraction step.
- **EMAIL** — either pasted/forwarded as text via the capture UI, or sent to
  a per-client inbound email address and ingested automatically via webhook
  (new in this phase, see §5).

## 3. Processing architecture

**Fire-and-forget background processing, no cron/queue polling.** The
capture API route creates the `CapturedInput` row (and, for file types,
uploads to Vercel Blob first) and returns immediately. The actual
transcribe/extract → segment → tag chain runs afterward using Next.js's
`after()` — scheduled to execute after the response is sent, within the same
Fluid Compute invocation. One continuous background chain per
`CapturedInput`, updating a `ProcessingJob` row at each step (`type`:
`transcribe` | `segment` | `tag`) for status visibility and retry
diagnostics. The capture page polls `CapturedInput.status` every few seconds
until it reaches `TAGGED` (or `FAILED`, surfaced with the `ProcessingJob.error`
message).

This was chosen over Vercel Cron polling: cron would add up to N minutes of
latency before an advisor sees any result, which is a poor fit for a
capture-and-review workflow where the advisor is often actively waiting on
the result of what they just uploaded.

## 4. Data flow per input type

1. **AUDIO**: file uploads to Vercel Blob → `CapturedInput` created
   (`status: PENDING`, `sourceRef` = blob URL) → background chain sends the
   blob to Whisper → `rawText` populated, `status: TRANSCRIBED` → segmenting.
2. **DOCUMENT / DATA_ROOM_FILE**: file uploads to Vercel Blob (PDF or DOCX)
   → text extracted synchronously in the background chain (fast, no need
   for an async transcription-style step) → `rawText` populated,
   `status: TRANSCRIBED` → segmenting.
3. **TEXT_NOTE / EMAIL (pasted)**: advisor pastes text directly via the
   capture form → `rawText` set immediately at creation → straight to
   segmenting, no extraction step.
4. **EMAIL (forwarded)**: advisor forwards an email to their client's
   dedicated inbound address → inbound email webhook receives it, extracts
   sender/subject/body into one text block → creates a `CapturedInput`
   (`type: EMAIL`, `organizationId` resolved from the address) → the webhook
   handler triggers the same `after()`-based background chain described in
   §3 (segmenting, then tagging) — no separate processing path from the
   UI-driven capture flow.

**Segmenting** (all types converge here): `rawText` is chunked into
`CapturedSegment` rows — paragraph/turn-based split, with a Claude call to
re-chunk if the text looks like a messy transcript (run-on speech, no
punctuation).

**Tagging**: each segment gets a Claude call producing tag suggestions
(domain/capability/KPI/stakeholder) with confidence scores, written as `Tag`
rows. `confidence >= 0.85` auto-approves (`status: AUTO_APPROVED`); below
that lands in `PENDING_REVIEW`, surfaced on the review page. (Threshold is a
starting guess per the original design spec §8 — expect to tune after real
usage.)

## 5. Inbound email

**New external integration for this phase.** Each `Organization` gets a
deterministic inbound email address derived from its `id` — e.g.
plus-addressing (`capture+<orgId>@ingest.<domain>`) on a shared inbound
address, so no new schema field is needed to store per-org addresses; the
org id is recoverable directly from the recipient address the webhook
receives. Exact scheme (plus-addressing vs. subdomain, and which inbound
email provider — e.g. a SendGrid/Postmark/Mailgun-style inbound parse
webhook) is pinned during implementation planning via the standard
marketplace-discovery flow (`vercel:marketplace` skill), not decided here.

The capture page displays the client's inbound address so advisors know
where to forward mail.

## 6. UI

- **Capture page** (`app/clients/[id]/capture`): a form with a type
  selector (Audio / Document / Data Room File / Text Note / Email) — file
  upload for the first three, textarea for the last two — plus a list of
  recent captures showing live status (polling until `TAGGED`/`FAILED`).
  Displays the client's inbound email address for forwarding.
- **Review page** (`app/clients/[id]/review`): a queue of `PENDING_REVIEW`
  tags grouped by segment, showing the segment text, suggested tag target
  and confidence, with approve/reject/reassign actions (updates `Tag.status`,
  `reviewedBy`, `reviewedAt`).

Both reuse the existing shadcn/ui components and layout conventions already
used by `assess`/`analysis`/`report` pages.

## 7. Testing

Integration tests against the real Supabase DB (same pattern as Phase 1 —
no mocked database) for the `CapturedInput`/`CapturedSegment`/`Tag` data
flow and status transitions. Whisper and Claude API calls themselves are
mocked in tests — real external AI APIs are not something to hit in an
automated test suite — but everything else (DB writes, segment/tag
creation, status updates) exercises real code paths against real Postgres.

## 8. External dependencies to provision

- `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` — not yet set in Vercel (checked
  at brainstorm time via `vercel env ls`); needed before this phase can
  actually call Whisper or Claude. To be obtained from the user during
  implementation, same pattern as the Supabase credentials in Phase 1.
- Vercel Blob — needs provisioning (file storage for audio/PDF/DOCX
  uploads).
- An inbound email service — needs marketplace discovery + provisioning
  (§5).
- PDF and DOCX text-extraction libraries — specific npm packages selected
  during implementation planning, not pinned here.

## 9. Open questions / risks

- **Inbound email provider choice** is deliberately deferred to planning
  (marketplace discovery) rather than pinned here — the right choice depends
  on what's available/pricing at implementation time, not a design-level
  concern.
- **Auto-tag confidence threshold (0.85)**, inherited from the Phase 1
  design spec, remains untuned — same caveat applies here as it did there.
- **DOCX/PDF extraction fidelity** (tables, multi-column layouts, scanned/
  image-only PDFs) is not addressed — Phase 2a assumes reasonably clean,
  text-extractable documents. Scanned-document OCR is out of scope.
