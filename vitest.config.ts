import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Each database test file boots an in-memory Postgres (PGlite WASM), which can take
    // well over 10s when several start at once on modest hardware or CI runners.
    hookTimeout: 60_000,
    testTimeout: 30_000,
    // Each worker may hold an in-memory Postgres; fewer workers avoids memory pressure.
    maxWorkers: 4,
  },
});
