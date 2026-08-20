# Flowstate Architecture

## Runtime

```text
Browser
  -> Next.js UI and API routes
  -> Supabase Auth for identity/session management
  -> Prisma adapter for application data
  -> Supabase PostgreSQL
```

Supabase is the hosted production platform. It provides authentication and the PostgreSQL database. Flowstate does not maintain a second production database.

## Database connections

- `DATABASE_URL`: pooled Supabase PostgreSQL connection used by the runtime Prisma adapter.
- `DIRECT_URL`: direct PostgreSQL connection used by Prisma CLI/migrations. Transaction-pooler connections are not suitable for migration advisory locks.
- Local integration tests use an isolated PostgreSQL database and must never silently target shared or production data.

## Authorization

Supabase authentication proves identity. Prisma `UserOrganization` membership proves organisation access. Every organization-scoped route must resolve resource ownership server-side and enforce membership before reading or mutating data. Client-supplied organization IDs are not authorization.

## Environment boundaries

- Production/preview: Supabase and Vercel-managed environment variables.
- Local application development: local Node.js process with non-production configuration.
- Integration tests: disposable local PostgreSQL, started with `npm run db:test:start`, or a dedicated CI PostgreSQL service.
- Hermes AI-stack Docker: separate infrastructure; Flowstate does not depend on its Docker socket or containers.

## Architectural rules

1. No schema or migration changes without an explicit reviewed migration.
2. Never run destructive integration tests against a shared Supabase database.
3. API routes authenticate first, resolve resource ownership second, and authorize membership third.
4. Deployment sign-off requires tests, typecheck, lint, build, and real user-journey evidence for UI/auth changes.
5. Environment assumptions must be documented in the repository, not held only by an agent or chat transcript.
