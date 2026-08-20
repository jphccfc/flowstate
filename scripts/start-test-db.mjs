import EmbeddedPostgres from "embedded-postgres";
import { access, mkdir, writeFile } from "node:fs/promises";

const port = Number(process.env.FLOWSTATE_TEST_DB_PORT ?? 55432);
const dataDir = process.env.FLOWSTATE_TEST_DB_DIR ?? ".flowstate-test-db/data";
const password = process.env.FLOWSTATE_TEST_DB_PASSWORD ?? "flowstate-local-test-only";
const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: "flowstate_test", password, port, persistent: true });
await mkdir(".flowstate-test-db", { recursive: true });
try { await access(`${dataDir}/PG_VERSION`); } catch { await pg.initialise(); }
await pg.start();
try { await pg.createDatabase("flowstate_test"); } catch (error) {
  if (!String(error).toLowerCase().includes("already exists")) throw error;
}
await writeFile(".flowstate-test-db/connection.env", `DATABASE_URL=postgresql://flowstate_test:${password}@127.0.0.1:${port}/flowstate_test\nDIRECT_URL=postgresql://flowstate_test:${password}@127.0.0.1:${port}/flowstate_test\n`);
console.log(`Flowstate test PostgreSQL is running on 127.0.0.1:${port}`);
console.log("Use the generated .flowstate-test-db/connection.env for test commands.");
process.on("SIGTERM", async () => { await pg.stop(); process.exit(0); });
process.on("SIGINT", async () => { await pg.stop(); process.exit(0); });
await new Promise(() => {});
