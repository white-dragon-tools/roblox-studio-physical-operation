import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.native.test.mjs"],
    testTimeout: 30000,
  },
});
