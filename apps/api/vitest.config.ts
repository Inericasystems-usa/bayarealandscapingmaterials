import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // The first import transforms the whole API graph; give boot room.
    hookTimeout: 40000,
    testTimeout: 20000,
    // One shared app instance across the suite — run serially in a single fork.
    pool: "forks",
    fileParallelism: false,
  },
});
