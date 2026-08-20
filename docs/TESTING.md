# Flowstate Testing

## Test layers

- Unit tests: `npm run test:unit` — no database required.
- Integration/schema tests: `npm run test:integration` — requires isolated PostgreSQL.
- Full suite: `npm test` — runs the preflight first, then all tests.
- Static checks: `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## Local database

Start the user-space PostgreSQL instance outside Docker:

```bash
npm run db:test:start
source .flowstate-test-db/connection.env
npx prisma db push
npm test
```

Stop it when finished:

```bash
npm run db:test:stop
```

The default database listens on `127.0.0.1:55432` and stores data under `.flowstate-test-db/`, which is git-ignored. It is separate from Supabase and the Hermes AI stack.

## Safety

The test preflight rejects non-local database hosts by default. To use a dedicated remote test database, set `FLOWSTATE_ALLOW_NONLOCAL_TEST_DB=true` only in a controlled environment. Never use the production Supabase database for destructive tests.

## CI

CI provisions PostgreSQL as a job service, applies the Prisma schema, then runs the same test, typecheck, lint, and build commands used locally.
