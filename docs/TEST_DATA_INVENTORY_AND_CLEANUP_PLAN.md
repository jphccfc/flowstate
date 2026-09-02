# Flowstate test-data inventory and cleanup plan

**Status:** read-only inventory; no database connection, query, or mutation was performed.

## Safety boundary

This document is an inventory and a future cleanup plan only. It does **not** authorize deletion, update, merge, restore, `db push`, seeding, or any other database mutation. Production was not accessed, and no credentials were handled.

The exact identifier for **KP Windows** is not present in the repository. `KP Windows` is a protected organization name and must be excluded by exact/normalized name and by every confirmed identifier (organization ID, related user IDs/emails, and any explicitly supplied child IDs). Cleanup **cannot safely proceed** until the user confirms the exact KP Windows organization ID, or confirms that no such organization exists in the target database after a read-only lookup.

The Prisma demonstration organization `Window & Door Manufacturing Co.` is **not** KP Windows by implication and must not be treated as the same organization.

## Repository evidence inspected

- `prisma/schema.prisma`: all organization-scoped models, relations, and delete behaviors.
- `prisma/seed.ts`: demonstration seed data.
- `scripts/seed-local-qa.ts`: deterministic local QA fixture IDs.
- `tests/helpers/db.ts`: integration fixture creation and cleanup convention.
- `tests/schema/**/*.test.ts`: test organization names, fixture emails, and special cleanup.
- `scripts/test-db-preflight.mjs`, `scripts/start-test-db.mjs`, `docs/TESTING.md`, and `package.json`: isolated test database boundary and commands.
- Prisma migrations: database foreign-key behavior, including restrictive dependencies.

## Candidate test-only markers and identifiers

These are candidates for a **read-only inventory**, not an automatic deletion allow-list. A candidate must be corroborated by its environment, ownership, and dependency graph before any future deletion.

### Deterministic local QA fixture

The strongest repository-defined test-only marker is the local QA fixture:

- Organization ID: `local-qa-organization`
- Organization name: `Flowstate Local QA`
- User ID: `local-qa-user`
- User email: `qa@flowstate.local`
- Domain ID: `local-qa-domain`
- Capability ID: `local-qa-capability`
- Organization industry: `QA`
- Capability description: `Local-only browser verification capability`

`docs/qa/local-authenticated-browser.md` also uses `/clients/local-qa-organization/...`, confirming its local QA purpose. These IDs are safe candidates only in an explicitly isolated local/test database. They are not evidence that a same-named record in Production is disposable.

### Integration-test organizations

`tests/helpers/db.ts` creates organizations with names matching `Test Org <timestamp>` unless overridden. Schema tests also use clearly test-labelled names, including patterns such as:

- `* Test Org`, `* Test Organisation`, `* Test Organization`
- `* Test Client`, `* Test Foreign Org`, `* Outsider Organisation`
- `Pipeline *`, `Route * Test Org`, `Maturity * Test Org`, `Evidence * Org`, `* Pack Org`, `* Decision * Organisation`, `* Planning Organisation`, and similar test-specific labels
- `Smoke Test Org`, `Dependency Test Org`, `Agent Run Contract Org`, `Agent Run Foreign Org`

The suite creates many rows with deterministic or timestamped fixture email patterns, including:

- `advisor@test.com`, `session-advisor@test.com`, `recommendation-advisor@test.com`, `suggest-advisor@test.com`
- `task-advisor@test.com`, `other-org@test.com`, `planning-advisor@test.com`, `planning-system-admin@test.com`, `planning-outsider@test.com`
- `platform-admin@test.com`, `global-target@test.com`, `agent-admin@test.com`
- timestamped `*@flowstate.test` and `*@test.com` users such as `advisor-<timestamp>@flowstate.test`

These users are shared across tests and are **not safe to delete solely from their email domain**. Some tests upsert or temporarily change roles and memberships. Inventory them separately, then confirm whether they are dedicated to the target test database and whether any non-test organization still references them.

### Agent-contract fixture keys

`tests/schema/agent-runs.test.ts` explicitly cleans agent definitions whose key starts with:

- `run-contract-agent-`

This is a stronger marker for agent-catalogue test rows than a display name. Before any deletion, inventory the definition, prompt versions, input rules, runs, and outputs; agent definitions and prompt versions are global (not organization-owned), and runs have restrictive references to both the definition and prompt version.

### Seed data: excluded from automatic cleanup

`prisma/seed.ts` creates `Window & Door Manufacturing Co.` with realistic manufacturing due-diligence content, stakeholders (`Priya Nair`, `Marc Dubois`, `Sam Okafor`), locations, KPIs, assessments, tags, dependencies, conflicts, and a recommendation. It uses generated CUIDs and does not provide a stable test-only organization ID or a `TEST` marker.

Therefore it is **not** an automatic candidate. Do not infer that it is KP Windows; preserve it unless a separate owner explicitly confirms it is disposable demonstration data and supplies the exact organization ID.

## Dependency and deletion risks

### Organization-owned cascade graph

Deleting an organization cascades through the organization-owned tree, including:

- `UserOrganization`
- `BusinessDomain` → `Capability`
- `Stakeholder`, `KPI`, `Process`, `Technology`, `Project`, `Achievement`
- `AssessmentSession` → `CapturedInput` → `CapturedSegment` → `Tag` and `CapturedInputAttachment`
- `FollowUpSuggestion` (through session)
- `Recommendation` → `RecommendationFeedback`
- `MaturityRubric` rows scoped to the organization
- `AssessmentTask`
- `PlanningItem` and its child hierarchy
- `CommunicationPack` → `CommunicationPackAcknowledgement`
- `InboundEmailEndpoint`
- `AgentRun` → `AgentOutput`

Capability-owned rows also cascade from `Capability`, including maturity assessments, decisions, approved insights, perspectives, proposals, target maturities, KPI ceilings, and association rows. This means an organization delete is a broad data-loss operation, not a single-record cleanup.

### Restrictive or non-organization references

A future cleanup must inspect these before deleting anything:

- `AssessmentSession.advisorId`, `AssessmentTask.requesterId`, and `AssessmentTask.assigneeId` use restrictive user references. Deleting users before their dependent rows can fail.
- `CommunicationPack.creator` and acknowledgement `actor` are restrictive user references. Reviewer/creator fields otherwise use `SetNull` or restrict depending on the relation.
- `AgentDefinition.createdBy` and `AgentPromptVersion.authoredBy` are restrictive user references.
- `AgentRun.agentDefinitionId` and `promptVersionId` are restrictive; delete dependent runs/outputs only after preserving the intended audit policy and verifying the agent fixture is truly test-only.
- `Recommendation.sourceGrowthActionId`, planning parents, approved-insight links, session links, stakeholder links, and follow-up links use `SetNull` or cascade and must be included in the inventory.
- `Dependency` and `ConflictFlag` are polymorphic/manual-reference tables (`sourceType/sourceId`, `targetType/targetId`) without foreign keys. They do not safely follow organization deletion and require explicit ID-based inventory for references to candidate capabilities/KPIs/stakeholders.
- `MaturityAssessment.sourceSegmentIds`, `MaturityProposal.sourceEvidenceIds/sourcePerspectiveIds`, `AssessmentDecision.sourceEvidenceIds/sourcePerspectiveIds`, and related string arrays are denormalized references with no FK enforcement. These must be checked for dangling references and audit implications.
- `ProcessingJob` is global and uses `targetId` without a foreign key. Inventory jobs whose target belongs to a candidate organization before cleanup.
- Global `MaturityRubric` rows (`organizationId IS NULL`) must be excluded.

### Users are not organization-owned

Deleting an organization removes memberships but does not automatically mean its users are disposable. A user may belong to multiple organizations or be referenced by global agent catalogue, task, session, communication-pack, or audit fields. User cleanup requires a separate, explicit, cross-organization reference check.

## What is excluded now

- KP Windows by name, plus all exact identifiers the owner later confirms.
- Any organization whose ID is not proven test-only.
- `Window & Door Manufacturing Co.` and all of its generated-ID seed graph.
- Real-looking stakeholder, customer, advisor, executive, investor, or production records merely because they contain `test`, `qa`, or a familiar fixture email.
- Global users, agent definitions, prompt versions, processing jobs, dependencies, conflict flags, and global rubrics unless each row is independently proven test-only.
- Any Production query or mutation in this environment; no authenticated database access is available.

## Safe future dry-run procedure

1. Obtain the target environment explicitly; refuse Production/shared databases unless the owner separately authorizes a read-only inventory and confirms the connection boundary. Use only a redacted connection description in logs.
2. Read organization IDs, names, creation timestamps, memberships, and counts of every dependent model. Do not use organization name alone as a deletion key.
3. Apply the candidate markers above as labels, not decisions. Resolve all polymorphic and denormalized references, global users, jobs, agent rows, and external object references.
4. Build an exclusion set containing `KP Windows` by exact/normalized name and all confirmed identifiers. Abort if the target database contains an ambiguous name collision, an unknown KP identifier, or a candidate with any protected reference.
5. Produce a review artifact containing candidate IDs, reasons, counts, dependencies, exclusions, and unresolved risks. The script must default to dry-run and fail closed unless an explicit future deletion command is separately approved and implemented.
6. Only after written confirmation, a recovery/backup plan, and a second read-only verification should an authorized operator design a deletion transaction. This document does not provide that authorization or deletion implementation.

## Exact confirmation required before deletion

Before any record deletion, the owner must explicitly confirm all of the following in writing:

> “I confirm the target environment is **[named non-production environment]** and not Production. I authorize deletion of exactly these organization IDs: **[list]**, and, if applicable, these separately approved global test IDs: **[list]**. I confirm that **KP Windows is protected and must not be deleted or changed**; its exact organization ID is **[ID]** (or I confirm the read-only inventory found no KP Windows record). I confirm the listed organizations and all dependent rows are test-only, no listed user is shared with a real organization, and I have an approved backup/recovery plan: **[plan/reference]**. No other organizations, users, global catalogue rows, jobs, dependencies, conflicts, or seed data may be changed.”

If the KP Windows identifier is not supplied or independently verified by a read-only lookup, the cleanup must remain blocked.
