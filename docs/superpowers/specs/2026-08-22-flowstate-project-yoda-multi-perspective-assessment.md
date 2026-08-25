# Flowstate Project Yoda: Multi-Perspective Evidence and Assessment Specification

**Status:** Approved product requirements baseline  
**Date:** 2026-08-22  
**Phase:** Project Yoda — transparent AI assistance  
**Depends on:** Project Ewok foundation and existing capture, review, assessment, provenance, and recommendation workflows  
**Enables:** Project Wookiee collaboration and Project Holocron document/message integrations

> **Roadmap alignment (2026-08-25):** This specification remains the authoritative assessment and provenance contract. The consolidated Week 35 roadmap in `docs/superpowers/specs/2026-08-25-flowstate-product-roadmap-week-35.md` places the delivered decision → insight → growth action → recommendation chain in Project Yoda, executive reporting immediately after it, and the proposed negative-to-positive Flowstate Score, governed Agent View, Work Hub, and industry-factor multiplier in later dependent phases. The existing 0–5 maturity rubric is intentionally retained as a diagnostic layer rather than replaced by the Flowstate Score.

## 1. Purpose

Project Yoda establishes a transparent, evidence-led AI workflow for turning captured information into reviewed assessments and recommendations.

The system combines employee and stakeholder accounts, expert analyst assessments, documents, files, messages, transcripts, structured data, and assessment history while preserving differences between sources. It must not reduce multiple perspectives to an unexplained average or allow AI output to become authoritative without human review.

## 2. Product goal

Make Flowstate the trusted review layer between organisational evidence and business decisions:

```text
Evidence and stakeholder accounts
→ proposed capability and meaning
→ provenance and confidence
→ multi-perspective assessment
→ human decision and sign-off
→ approved insight
→ growth plan, priorities, reports, and recommendations
```

## 3. Goals

- **G1 — Make evidence usable:** convert files, messages, transcripts, interviews, and structured inputs into attributable, reviewable evidence.
- **G2 — Preserve lived experience:** capture employee and stakeholder accounts in their own words, including score, rationale, context, and constraints.
- **G3 — Make expert judgement explicit:** store analyst and expert perspectives separately from employee accounts.
- **G4 — Bound AI transparently:** let AI classify, summarise, propose capabilities, suggest ratings, identify conflicts, and explain implications without silent approval.
- **G5 — Make ratings defensible:** use a visible, configurable, versioned 0–5 rubric and retain the evidence behind every approved rating.
- **G6 — Turn disagreement into insight:** treat material differences between perspectives as useful findings.
- **G7 — Connect evidence to action:** use approved assessments for gap, KPI, objective, value, growth planning, recommendations, communications, and sign-offs.
- **G8 — Prepare integrations safely:** make future document/message connectors produce the same normalised evidence objects as existing capture channels.

## 4. Objectives and measurable outcomes

| Objective | Evidence of completion |
|---|---|
| O1. Record individual perspectives | Multiple employee, manager, analyst, expert, and AI perspectives coexist without overwriting earlier entries. |
| O2. Preserve original language | Each perspective retains an attributable quote/account, source, date, and context. |
| O3. Support fractional values | Perspective and approved scores support values such as `0.5`, with precision controlled by the rubric. |
| O4. Explain differences | UI reports distributions, ranges, conflicts, confidence, and material variance. |
| O5. Apply a configurable rubric | Definitions, anchors, evidence requirements, versions, and effective dates are visible and stored. |
| O6. Produce evidence-backed AI proposals | Proposals include capability, interpretation, score/range, confidence, sources, and processing metadata. |
| O7. Require human approval | Evidence, AI suggestions, and final decisions have explicit review states and reviewer history. |
| O8. Preserve traceability | Approved scores link to supporting/conflicting perspectives, evidence, rubric, rationale, reviewer, and timestamp. |
| O9. Feed approved outputs into planning | Priorities and recommendations link to approved evidence and assessment decisions. |
| O10. Support future integrations | Connector outputs conform to the same evidence contract used by capture, interviews, and transcripts. |

## 5. Functional requirements

### FR-1 — Normalised evidence

Each evidence item shall include organisation/scope, source type, source reference/location, author/speaker/sender where available, source and ingestion dates, original text or observation, extracted claims/practices/outcomes/risks/gaps, proposed capability links, confidence, relevance, provenance, processing metadata, review state, and decision history.

Source types include interview, employee account, document, file, email, message, transcript, system record, and other approved sources.

### FR-2 — Stakeholder perspectives

Each person’s assessment shall be an independent perspective containing:

- Assessor identity or permitted pseudonymous reference.
- Stakeholder type and role.
- Score and score precision.
- Original account in the stakeholder’s words.
- Structured rationale and supporting evidence.
- Scope, location, team, or business unit.
- Confidence, rubric version, and review state.
- Submission, review, and update timestamps.

A later perspective shall not overwrite an earlier perspective.

### FR-3 — Expert perspectives

Expert and analyst assessments shall be stored separately from employee and stakeholder self-assessments. Role provides context for interpretation; it is not an automatic authority override.

### FR-4 — AI capability proposals

AI shall be able to propose one or more capabilities, explain what evidence means, suggest a maturity score or range, identify relevant dimensions, confidence, missing evidence, contradictory evidence, and follow-up questions. Every proposal remains a draft until human review.

### FR-5 — Rating validation

For an existing as-is rating, the system shall classify evidence and perspectives as **supports**, **partially supports**, **conflicts with**, **insufficient evidence**, **outdated/superseded**, or **not relevant**. It shall show whether evidence supports a score, range, or no reliable conclusion. AI shall not silently change an approved rating.

### FR-6 — Perspective balance

The assessment view shall show individual scores, stakeholder groups and roles, range/distribution, material variance, evidence coverage, supporting/conflicting evidence, AI synthesis and confidence, approved score, and pending decisions. A simple average must not be shown as the final truth without its underlying perspectives.

### FR-7 — Configurable maturity rubric

The default versioned rubric is:

| Level | Default meaning |
|---:|---|
| 0 | No meaningful capability exists. The need may be unrecognised, unmanaged, or dependent on informal individual effort. |
| 1 | Ad hoc awareness or isolated activity exists, but practice is reactive, inconsistent, undocumented, and individual-dependent. |
| 2 | The capability is recognised and repeatable in parts of the organisation, but adoption and measurement are inconsistent. |
| 3 | The capability is defined, documented, owned, consistently operated, and monitored across the relevant organisation. |
| 4 | The capability is integrated, measured, continuously improved, and supported by strong data, governance, technology, and cross-functional practice. |
| 5 | The organisation is recognised as an industry leader, sets external benchmarks, shapes industry practice, and may define global strategic direction for the capability. |

The rubric shall support organisation defaults, capability-specific overrides, dimension-specific definitions, anchor descriptions, evidence requirements, versions, effective dates, ownership, and historical retention. Level 0 means the capability is absent or not meaningfully established; it does not mean the organisational need is absent.

### FR-8 — Maturity dimensions

Where required, capabilities may be assessed across process, people/skills, technology/data, governance/ownership, measurement/outcomes, adoption/consistency, and external differentiation. Overall scores must retain dimension evidence where collected.

### FR-9 — Human decisions and sign-off

Reviewers shall be able to accept/reject/edit AI evidence and capability assignments, accept/reject/amend suggested scores/ranges, mark evidence irrelevant/outdated/conflicting, approve or reopen as-is scores, record rationale, request evidence, assign follow-up ownership, and sign off or leave decisions pending.

### FR-10 — Approved assessment decision

An approved decision shall retain approved score/range, capability and scope, rubric version, supporting and conflicting perspective IDs, supporting evidence IDs, decision rationale, reviewer/approver, status, and timestamps.

### FR-11 — Insights and growth planning

Approved evidence and decisions shall support consensus strength, perception gap, employee experience gap, definition gap, evidence gap, execution gap, maturity gap, high-priority capability gap, and unresolved-conflict insights. Growth plans and recommendations must link to the approved evidence and decision that created the priority.

### FR-12 — Reporting and communications

The evidence-rich view shall show individual accounts, quotes, sources, conflicts, rubric interpretation, confidence, and decision history. The executive view shall show approved score, stakeholder range, key perception gap, business implication, agreed priority, and sign-off status, clearly identifying provisional content.

### FR-13 — Integration boundary

Future file and message integrations shall produce normalised evidence items and use the same capability proposal, review, provenance, rubric, and decision workflow. Connectors shall not write directly to approved assessments, recommendations, KPIs, objectives, or value records.

## 6. Non-functional requirements

- **Traceability:** every approved insight and recommendation is traceable to approved evidence and an approved assessment decision.
- **Human control:** AI output remains provisional until a permitted human approves it.
- **Explainability:** UI exposes source passages, rubric anchors, confidence, conflicts, and reasons.
- **Privacy and authorization:** source permissions, organisation membership, and role visibility are enforced server-side.
- **Immutable history:** corrections preserve previous perspectives, evidence decisions, ratings, and sign-offs with reasons.
- **Responsive UX:** review, comparison, scoring, and sign-off work on desktop and mobile without horizontal page overflow.
- **Gateway discipline:** AI uses the central LiteLLM-compatible gateway; credentials remain server-side.
- **Resilience:** ingestion and AI processing expose status, retryable failures, and partial results without losing provenance.
- **Evaluation quality:** AI is evaluated for capability assignment, evidence relevance, maturity interpretation, conflict detection, and hallucination resistance.

## 7. Core user journeys

### Employee account

```text
Receive capability prompt → provide score and words → attach/reference evidence → submit → reviewer clarifies or acknowledges
```

### Analyst assessment

```text
Review accounts and evidence → select rubric → record independent score/range and rationale → identify support/conflict → submit for approval
```

### AI evidence proposal

```text
Ingest file/message/transcript → segment and classify → propose capability and meaning → propose score/range and confidence → human accepts, edits, rejects, or requests evidence
```

### Rating validation

```text
Select existing score → compare evidence and perspectives → show support/conflict/coverage/confidence → AI proposes validation → human retains, changes, or reopens score
```

### Growth planning and sign-off

```text
Approved assessment → insight and priority → growth action and owner → communication pack → stakeholder sign-off
```

## 8. Scope

### In scope

Evidence/provenance contract; multi-perspective assessments; employee/analyst separation; fractional scores/ranges; default 0–5 rubric; rubric versioning; AI capability/rating proposals; evidence-based validation; conflict and perspective-gap insights; human approval/sign-off; report and communication requirements; future integration contract.

### Out of scope for the first implementation slice

Production connectors for every platform; automatic approval; fully autonomous recommendations; hidden role weighting; changes to organisation authorization; unreviewed schema migrations; treating AI confidence as business certainty.

## 9. Delivery sequence

1. Define and test evidence and perspective contracts.
2. Add rubric definitions/versioning without changing approved history.
3. Add independent employee and analyst perspectives.
4. Add comparison, conflict states, and evidence coverage.
5. Add AI capability proposals and rating validation through LiteLLM.
6. Add human decisions and sign-off records.
7. Connect approved decisions to insights, growth planning, reports, and recommendations.
8. Deliver Project Wookiee collaboration.
9. Deliver Project Holocron connectors into the normalised evidence intake.

## 10. Current delivery status and next boundary

The evidence-led assessment, human sign-off, approved-insight, owned/dated growth-action and recommendation-traceability slices are delivered in the current platform. The next boundary is the executive analysis/report read model that presents the complete chain without turning provisional AI content into approved business output.

The following remain downstream of this specification and must not bypass its review contract:

- Flowstate opportunity score and multiplier.
- Specialist Agent View and workspace agent customization.
- Unified WorkItem/task orchestration.
- Industry/economic research factors.
- Additional production integrations.

## 11. Acceptance criteria

Project Yoda's multi-perspective assessment slice is complete when:

- Multiple stakeholder and expert scores coexist for one capability and scope.
- Employee words and evidence remain attributable and visible.
- Fractional scores/ranges are supported under the active rubric.
- Reported scores, AI interpretations, and approved decisions are distinct.
- The 0–5 rubric is visible and versioned.
- AI proposes capabilities, explains meaning, suggests scores/ranges, and identifies conflict.
- AI cannot silently approve evidence or overwrite an approved score.
- Reviewers can accept, reject, edit, reopen, request evidence, and sign off.
- Validation shows support, conflict, coverage, confidence, and variance.
- Insights and priorities link to approved evidence and decisions.
- Executive reports communicate approved score and stakeholder balance.
- Future document/message inputs enter the same review workflow.
- Cross-organisation tests, full automated tests, typecheck, lint, build, responsive checks, and safe authenticated browser journeys pass for the implemented slice.
