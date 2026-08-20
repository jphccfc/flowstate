import { readFile } from "node:fs/promises";
import EmbeddedPostgres from "embedded-postgres";
try {
  const env = await readFile(".flowstate-test-db/connection.env", "utf8");
  const port = Number(env.match(/127\.0\.0\.1:(\d+)/)?.[1] ?? 55432);
  const pg = new EmbeddedPostgres({ databaseDir: ".flowstate-test-db/data", user: "flowstate_test", password: process.env.FLOWSTATE_TEST_DB_PASSWORD ?? "flowstate-local-test-only", port, persistent: true });
  await pg.stop();
  console.log(`Flowstate test PostgreSQL stopped on port ${port}.`);
} catch {
  console.log("Flowstate test PostgreSQL is not running.");
}
