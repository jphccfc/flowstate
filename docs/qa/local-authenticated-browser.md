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

## Scratch Pad regression harness

The repository-owned browser regression covers desktop and mobile-sized Chromium viewports, editor replacement/deletion/insertion, rerender stability, composition/transcription-style input, autosave, reload persistence, ordered text, and browser errors. It is intentionally limited to the Scratch Pad test:

```bash
npm run test:browser
```

The app must already be running at `http://127.0.0.1:3010` with the isolated database and `FLOWSTATE_LOCAL_QA_AUTH=1`. Override the URL with `FLOWSTATE_QA_BASE_URL` when needed. Playwright requires Chromium; the config checks the bundled executable (or `FLOWSTATE_CHROMIUM_PATH`) and fails clearly if it is unavailable. Install it locally with:

```bash
npx playwright install chromium
```
