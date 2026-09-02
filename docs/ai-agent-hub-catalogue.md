# AI Agent Hub catalogue foundation

This slice adds a global, organisation-independent agent definition contract for `SYSTEM_ADMIN` users only. It deliberately does not run agents, call models, trigger automation, store tokens, communicate externally, or approve assessment outputs.

## API

- `GET /api/admin/agents` — list definitions, immutable prompt versions, input rules, and the explicitly published version.
- `POST /api/admin/agents` — create a definition and immutable version 1. Body requires `key`, `name`, `prompt`, `changeReason`; optional `description` and `inputRules`.
- `POST /api/admin/agents/:id/versions` — append an immutable prompt version; requires `prompt` and `changeReason`.
- `POST /api/admin/agents/:id/publish` — explicitly publish a version by `versionId`. Publication records `publishedAt` and `publishedBy` and updates the definition pointer atomically.

Input rules contain only the existing `InputType` enum and a bounded lowercase identifier (`a-z`, `0-9`, `.`, `_`, `-`). They are declarative scope metadata, not executable configuration.

All routes authenticate with Supabase and re-check the database-backed `User.role === SYSTEM_ADMIN`; organisation membership is neither required nor sufficient.

## Follow-up UI slice

The existing platform administration page remains unchanged in this foundation slice. A responsive catalogue editor should be added next using its established admin shell, with keyboard-accessible version history, explicit publish confirmation, and clear separation between draft and published versions.
