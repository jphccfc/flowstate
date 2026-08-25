# Flowstate Product Roadmap — Week 35 Scope Integration

**Date:** 2026-08-25  
**Status:** Proposed consolidated roadmap  
**Decision owner:** Flowstate product owner  
**Supersedes:** The unsequenced Week 35 product-development note as the delivery planning reference. Existing phase specifications remain historical implementation records unless this document explicitly changes their scope.

## 1. Executive decision

The Week 35 scope is accepted as a **strategic expansion of the existing Flowstate vision**, not as seven independent feature projects.

The product should remain one controlled loop:

```text
Integrations and workspace evidence
→ specialist analysis and provisional AI proposals
→ human review and authorised decisions
→ approved capability/maturity evidence
→ growth actions and recommendations
→ Flowstate opportunity score and multiplier
→ executive reporting and next decisions
→ new tasks, evidence requests, and follow-up inputs
```

The implementation order must preserve these dependencies:

1. Evidence and organisation boundaries.
2. Human-reviewed assessment and provenance.
3. Approved insights, actions, recommendations and reporting.
4. Opportunity/value scoring and multiplier model.
5. Governed specialist agents and agent customization.
6. General task/work orchestration and closed-loop automation.
7. Scaled integrations, industry intelligence and subscription features.

Do not build autonomous agents, a task-management platform, or a new scoring system before the human-controlled evidence and decision loop is reliable.

## 2. Product model and terminology

### 2.1 Evidence

Evidence is the normalised input layer: interviews, employee accounts, documents, files, email, messages, transcripts, structured records and external research. Every item remains attributable, scoped and reviewable.

Existing implementation: the Phase 2a/2b capture, segmentation, tagging and live-session foundations.

### 2.2 Assessment

Assessment is the diagnostic interpretation of evidence. The current 0–5 maturity rubric, stakeholder perspectives, expert perspectives, as-is/to-be records, conflicts, decisions and sign-off remain the authoritative maturity layer.

The 0–5 scale is **not** replaced by the proposed negative-to-positive Flowstate Score. They answer different questions:

- Maturity: how established is a capability?
- Flowstate Score: what is the business's current opportunity/value position after considering capability, context and potential?

### 2.3 Approved insight, growth action and recommendation

These are a single traceable execution chain, not separate AI outputs:

```text
signed-off AssessmentDecision
→ ApprovedInsight
→ owned and dated GrowthAction
→ human-reviewed Recommendation
```

The existing recommendation workflow remains the review boundary. AI may draft; an authorised human approves, edits, rejects or requests evidence.

### 2.4 Analysis and reporting

The Week 35 “Data Analyst section” consolidates the existing analysis, insights and report experiences. It should provide drill-down from executive implication to evidence, perspectives, capability scores, actions and recommendations.

Do not create a second “Data Analyst” data model or duplicate the existing analysis/report navigation.

### 2.5 Agents

“Agent View” is a governed workspace control plane for specialist analysis, not an autonomous authority layer.

A specialist agent has:

- a named purpose and output contract;
- approved input sources and organisation scope;
- a prompt/system configuration;
- optional workspace knowledge;
- a model/provider configuration through LiteLLM;
- allowed actions and prohibited actions;
- human review requirements;
- run history, source provenance and failure state.

Base agents are platform-defined. Workspace variants are scoped copies/configurations, not uncontrolled prompt overrides. Custom agents and industry-expert review are later subscription capabilities.

### 2.6 Growth Plan and assessment tasks

The Growth Plan and assessment tasks are separate product concepts.

- **Growth Plan:** strategic projects, initiatives, capability builds and enhancements intended to improve the approved business outcome: profitable growth, sale/acquisition recovery, liquidation/restructuring or multiplier improvement. `GrowthAction` remains the current actionable planning object for one Growth Plan initiative.
- **Assessment tasks:** operational work required during an assessment: evidence requests, interviews, follow-ups, validation, conflict resolution, AI review, sign-off and report preparation. These require their own task model and workflow.

Do not use `GrowthAction` for assessment tasks. A future shared technical base may reuse common fields, but the product must preserve separate types, permissions, lifecycle rules and user experiences.

## 3. Duplication removed from the Week 35 scope

| Week 35 proposal | Existing capability | Consolidated decision |
|---|---|---|
| Agent analysis of interviews, documents and image evidence | `CapturedInput`, segments, tags, AI integration and review workflow | Extend the existing evidence pipeline and add governed agent runs. Do not create a second ingestion path. |
| Data Analyst navigation | Assessment analysis, approved insights, recommendations and report pages | Evolve the existing analysis/insights/report experience into the Data Analyst view. |
| Task board for analysis activity | Growth actions, follow-up suggestions, review queues and processing jobs | Introduce a unified WorkItem model only after executive reporting and recommendation workflows are stable. |
| Integration Hub | Existing capture and ingestion project / Project Holocron boundary | Extend existing integrations and normalise outputs into evidence. Do not create a parallel hub. |
| Agent-produced recommendations | Existing human-reviewed Recommendation model and PR #69 traceability | Agents may draft recommendations, but the existing human approval and provenance workflow remains authoritative. |
| Current and target capability scores | Project Yoda 0–5 maturity assessments and target maturity | Retain the 0–5 maturity layer; use it as an input to the separate Flowstate Score. |
| Economic/industry analysis | Proposed multiplier context | Build as a signed, dated context input to the multiplier, not as an unreviewed score override. |
| Global/admin agents | Existing platform admin boundary | Add base-agent governance to admin only after tenant authorization and audit controls are complete. |

## 4. Revised delivery phases

### Phase 0 — Foundation, tenancy and security boundaries

**Status:** Foundation exists; security hardening remains an active prerequisite.

**Purpose:** Make organisation scope, client visibility, roles, permissions, auditability and environment separation trustworthy.

**Includes:**

- Supabase identity plus server-side organisation authorization.
- Organisation and workspace membership.
- Role/permission matrix for assessment, recommendations, reports, agent configuration and administration.
- Append-only history and provenance rules.
- Isolated PostgreSQL test workflow and migration discipline.
- Human approval boundary for AI output.

**Exit criteria:** Cross-organisation and role-denied database tests pass for every new mutation path; history cannot be silently overwritten or deleted through normal application behavior; audit events identify actor, scope, action and source.

### Phase 1 — Evidence and Integration Hub foundation

**Status:** Phase 2a/2b foundations are complete or substantially implemented.

**Purpose:** Normalise all workspace inputs into reviewable evidence.

**Includes:**

- Text, email, audio, document and data-room capture.
- Transcription, segmentation, tagging and confidence/review states.
- Live-session capture and follow-up suggestions.
- Source references, timestamps, authors/speakers, location/scope and processing status.
- Future SharePoint/data-room, forwarded-email, spreadsheet and meeting-minute connectors using the same evidence contract.

**Deferred:** Broad production connectors until the provenance and permission model is proven with the existing capture paths.

### Phase 2 — Project Yoda: evidence-led assessment and decision workflow

**Status:** Core slice delivered through PR #69; remaining reporting and hardening work continues.

**Purpose:** Turn evidence and multiple perspectives into defensible, human-approved decisions.

**Includes:**

- Employee, manager, stakeholder and expert perspectives as separate records.
- Versioned 0–5 rubric and fractional perspective scores.
- As-is and to-be maturity history.
- Perspective balance, conflict, coverage and evidence context.
- AI capability/rating proposals that remain provisional.
- Human assessment decisions, sign-off and append-only history.
- Approved insights, owned/dated growth actions and recommendation traceability.
- Role-aware authorization for insight, action and recommendation mutation paths.

**Immediate remaining increment:** Connect approved recommendations into the executive reporting experience and show the full traceability chain without requiring users to navigate disconnected screens.

**Exit criteria:** An authorised reviewer can move from evidence to signed-off decision to approved insight to owned/dated action to reviewed recommendation and see the provenance at every step on desktop and mobile.

### Phase 3 — Human-reviewed Analysis and Executive Reporting

**Status:** Next delivery phase.

**Purpose:** Make the approved evidence useful to executives without presenting provisional analysis as fact.

**Navigation decision:** Use the existing Analysis / Insights / Report information architecture, with “Data Analyst” as the product concept or section label only where it improves comprehension. Do not add duplicate navigation for the same content.

**Scope:**

- Executive summary from approved decisions, insights and recommendations.
- Drill-down from business implication to domain, capability, perspective, evidence and decision history.
- Approved score, target, gap, stakeholder range, material variance, business implication, priority, owner and due date.
- Recommendation status and review state.
- Clear distinction between approved, provisional, requested-evidence and unresolved content.
- Report examples using real persisted structures, not static claims.
- Export/shareable report output only after authorization and provenance are established.

**Explicitly excluded:** A fully autonomous “analyst” that can publish conclusions or alter scores without human review.

### Phase 4 — Flowstate Score and opportunity/value model

**Status:** New phase; design before implementation.

**Purpose:** Add the business-level opportunity score described in Week 35 without corrupting the maturity model.

**Proposed model:**

```text
Flowstate Score
= current opportunity position
+ approved improvement potential
+ reviewed external/context factors
× reviewed Flowstate multiplier
```

The exact formula must be approved before schema work. It must preserve component-level explanations rather than storing only one opaque number.

**Required components:**

- Current position: capability weaknesses, approved business constraints and relevant operating evidence.
- Potential position: approved growth plan, target maturity and quantified opportunity where evidence supports it.
- Delta/opportunity: explicit difference between current and potential.
- Multiplier: separate, reviewable context factor with named components, evidence, effective date, confidence and reviewer.
- Scenario support: growth, recovery, acquisition, liquidation and multiplier-improvement paths must be represented as scenarios rather than overwritten values.
- Historical snapshots: score changes explain which approved input changed and why.

**Important guardrail:** Negative values are valid for the Flowstate Score, but existing maturity scores remain on their configured rubric. Do not force maturity assessments to become negative.

**Exit criteria:** An executive can explain the score, its delta, multiplier components, evidence, assumptions and approval state; score changes are reproducible from stored inputs.

### Phase 5 — Governed Agent View and workspace agents

**Status:** New phase; depends on Phases 0–3 and the authority matrix.

**Purpose:** Provide specialist agents that analyse workspace content consistently while preserving human control.

**Base agents:**

- Financial analyst.
- Business process/operations analyst.
- Marketing/commercial analyst.
- Industry/economic analyst.
- Evidence/provenance analyst.
- Executive synthesis/reporting agent.

Each base agent requires a tested output contract and a declared authority profile.

**Workspace agent view:**

- List enabled agents for the workspace.
- Show purpose, current status, last run, sources used and pending review items.
- Allow permitted prompt/knowledge customization through versioned changes.
- Show base configuration versus workspace override.
- Permit rerun, pause and request-more-evidence actions where authorized.
- Keep every output provisional until it enters the appropriate review workflow.

**Subscription/admin scope:**

- Workspace customization and additional agents are monetization features after the core workflow proves value.
- Global admins define and version base agents, inspect workspace variants and manage model/provider policy.
- Client users cannot grant agents authority they do not possess themselves.

### Phase 6 — Work hub and closed-loop analysis operations

**Status:** New phase; depends on approved reporting and agent outputs.

**Purpose:** Make the live hub of analysis activity actionable without creating uncontrolled automation.

**Scope:**

- General `WorkItem` abstraction for growth actions, evidence requests, follow-ups, analysis tasks and review tasks.
- Assignee, organisation scope, due date, priority, status, progress and provenance.
- List, calendar/week and completed views; introduce Gantt only if users need it after the simpler views are proven.
- Human and agent-created work items subject to role/authority checks.
- Agent progress may be reported as a reviewed estimate with explicit basis; it must not imply verified completion.
- Awaiting-input states such as missing P&L forecast are first-class workflow states.
- Closing or creating tasks from analyst review requires an authorised human decision where it changes business commitments.

### Phase 7 — Industry and economic intelligence

**Status:** New phase; can be prototyped as research input after Phase 4’s score contract exists.

**Purpose:** Supply reviewed external context to the multiplier and executive analysis.

**Scope:**

- Industry, sector, geography and economic research.
- Positive, negative or neutral classification with source, date, scope and confidence.
- Materiality and relevance review.
- Time-bounded context; stale research must expire or be superseded.
- Human approval before external factors affect a score or recommendation.
- Clear separation between source facts, analyst interpretation and score impact.

**Do not:** Let a news headline directly change the Flowstate Score or multiplier without an approved factor record.

### Phase 8 — Collaboration, monetization and platform administration

**Status:** Later value phase.

**Scope:**

- Project Wookiee collaboration and stakeholder communication workflows.
- Workspace agent subscriptions and additional specialist agents.
- Global/industry expert review tier.
- Base-agent administration, configuration versioning, usage controls and billing boundaries.
- Audit and reporting for who configured, ran, reviewed or approved agent outputs.

### Phase 9 — Scaled integrations and automation

**Status:** Later platform phase.

**Scope:**

- Production SharePoint/data-room connectors.
- Email and spreadsheet ingestion at scale.
- Document/image evidence processing at volume.
- Durable job orchestration and retries beyond the current Next.js/Vercel-first approach.
- Automation only where authority, failure recovery and human escalation are explicit.

## 5. Agent authority matrix — required before Phase 5

The authority model must be explicit and machine-enforced.

| Capability | Agent may propose | Agent may write provisional record | Agent may approve/commit |
|---|---:|---:|---:|
| Extract/segment/tag evidence | Yes | Yes, with provenance | No |
| Suggest capability link | Yes | Yes, provisional | No |
| Suggest maturity score/range | Yes | Yes, provisional | No |
| Identify conflict or missing evidence | Yes | Yes | No |
| Draft insight | Yes | Yes, provisional | No |
| Create growth-action proposal | Yes | Yes, provisional | No, unless explicitly delegated and audited |
| Draft recommendation | Yes | Yes, `DRAFT` | No |
| Set approved score/sign-off | No | No | Human with permission only |
| Approve recommendation | No | No | Human with permission only |
| Change Flowstate multiplier | Yes, factor proposal | Provisional factor only | Human with permission only |
| Assign binding business task | Suggest | Provisional task only | Human/role-authorized user only |
| Change base agent policy | No | No | Global admin only |

Every agent run must record: agent version, prompt/config version, model alias, source IDs, organisation scope, output status, reviewer, review decision and timestamps.

## 6. Updated navigation model

Avoid adding a new menu item for every noun in the Week 35 note.

```text
Workspace
├── Overview / Executive summary
├── Integrations / Evidence
├── Blueprint
├── Assessment
├── Analysis / Data Analyst
├── Growth plan / Work hub
├── Recommendations
├── Reports
└── Agents
```

Conditional or later views:

- Economic & Industry context: initially a subsection of Analysis; promote to navigation only when Phase 7 has a durable workflow.
- Task board: initially a Growth plan/work-hub view; do not create a separate task product until Phase 6.
- Agent administration: platform-admin area, not a client workspace menu item.

Every new route must update the Blueprint so the process flow remains coherent.

## 7. Immediate next steps

1. **Phase 3A — Executive traceability slice:** show approved decision → insight → growth action → recommendation in the report/analysis view.
2. **Phase 3B — Reporting evidence contract:** define the report read model and status semantics for approved, provisional, unresolved and awaiting evidence content.
3. **Phase 0 hardening:** finish role/permission coverage, append-only history protections and audit events before agent customization.
4. **Phase 4 design spike:** write and review the Flowstate Score/multiplier formula, scenario model, evidence requirements and historical snapshot model before changing Prisma.
5. **Phase 5 authority spike:** define base-agent contracts, workspace override rules, run provenance, review queues and subscription boundaries.
6. **Phase 6 task consolidation:** map `GrowthAction`, `FollowUpSuggestion`, evidence requests and processing jobs into a WorkItem proposal; do not implement until the map is accepted.
7. **Phase 7 research prototype:** create reviewed industry-factor records without wiring them into production scoring until Phase 4’s contract is approved.

## 8. Product acceptance principles

- Human review remains the authority boundary for decisions, recommendations, score changes and binding commitments.
- AI output is useful only when its source, scope, confidence, version and review state are visible.
- Quality and actionability take precedence over volume of generated analysis.
- No duplicate data models or navigation concepts when an existing workflow can be extended.
- Every feature affecting capabilities or assessments creates traceable inputs for the assessment/readout layer.
- Every score has explainable components and a historical reason for change.
- Every task has an owner, due date, status and organisation scope.
- Every external factor is dated, sourced, reviewable and reversible.
- Cross-organisation access is enforced server-side and covered by database-backed tests.
- Production deployment, schema changes and external connectors are separate approval gates.

## 9. Decision log

- The 0–5 maturity rubric remains the diagnostic scale.
- The negative-to-positive Flowstate Score is a separate opportunity/value score.
- Data Analyst is consolidated into Analysis/Insights/Reports rather than becoming a duplicate subsystem.
- Integration Hub extends the existing evidence pipeline and Project Holocron boundary.
- Growth actions are the current execution object; a general WorkItem model is deferred until Phase 6.
- Agent customization and monetization are deferred until authority, provenance and review are complete.
- Industry/economic research may inform multiplier factors only through a reviewed, time-bounded factor record.
- The next implementation slice is executive reporting traceability, not autonomous agents or a new score formula.
