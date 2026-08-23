# Local authenticated browser QA

This fixture provides a local-only authenticated session for browser verification without Supabase credentials.

## Safety

- It requires `FLOWSTATE_LOCAL_QA_AUTH=1`.
- It is disabled whenever `NODE_ENV=production`.
- Use only with the isolated Flowstate test PostgreSQL database.
- Do not combine it with production `.env.local` values.

## Start

```bash
npm run db:test:start
set -a; . .flowstate-test-db/connection.env; set +a
DATABASE_URL="$DATABASE_URL" DIRECT_URL="$DIRECT_URL" npx prisma db push
DATABASE_URL="$DATABASE_URL" DIRECT_URL="$DIRECT_URL" npm run db:seed:local-qa
```

Start Next without `.env.local` loaded, then set:

```text
FLOWSTATE_LOCAL_QA_AUTH=1
NODE_ENV=development
DATABASE_URL=<isolated test database>
DIRECT_URL=<isolated test database>
```

The seeded route is:

```text
http://127.0.0.1:3010/clients/local-qa-organization/assess
```

The deterministic local identity is `qa@flowstate.local`. It is not a real Supabase account.
