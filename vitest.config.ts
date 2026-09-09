import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
    // Schema tests share stable fixture users; run files serially to avoid cross-file upsert races.
    fileParallelism: false,
    // Keep Vitest scoped to application unit/schema tests; Playwright specs use `test:browser`.
    include: ["tests/unit/**/*.test.ts", "tests/schema/**/*.test.ts"],
  },
});
