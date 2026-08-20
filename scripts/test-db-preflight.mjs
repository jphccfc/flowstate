import { Client } from "pg";

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error("DATABASE_URL is required for the full test suite. Use npm run db:test:start first.");
  process.exit(1);
}

let url;
try { url = new URL(raw); } catch {
  console.error("DATABASE_URL is not a valid PostgreSQL URL.");
  process.exit(1);
}

const host = url.hostname.toLowerCase();
const allowed = new Set(["127.0.0.1", "localhost", "::1", "postgres"]);
if (!allowed.has(host) && process.env.FLOWSTATE_ALLOW_NONLOCAL_TEST_DB !== "true") {
  console.error(`Refusing to run destructive integration tests against ${host}. Use an isolated local/test database or explicitly set FLOWSTATE_ALLOW_NONLOCAL_TEST_DB=true.`);
  process.exit(1);
}

const client = new Client({ connectionString: raw, connectionTimeoutMillis: 3000 });
try {
  await client.connect();
  const result = await client.query("select current_database() as database");
  console.log(`Test database ready: ${host}:${url.port || "5432"}/${result.rows[0].database}`);
} catch {
  console.error(`Test database is unavailable at ${host}:${url.port || "5432"}. Run npm run db:test:start or configure a dedicated test database.`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
