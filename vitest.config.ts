import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // These are server/Node-side modules (Drizzle, node:crypto, Buffer, the
    // Gemini chat loop). None need a DOM, so the lighter `node` env is correct.
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "drizzle/**"],
    // Each test file is isolated (its own module registry), so module-level
    // state (the rate-limit / gemini-cooldown Maps) never leaks across files.
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**", "db/**", "app/**", "proxy.ts"],
      exclude: ["**/*.generated.json", "**/*.module.css"],
    },
  },
  resolve: {
    // Array form so the `@/…` alias is a precise regex that does NOT swallow
    // scoped package imports like `@google/genai` or `@next/third-parties`.
    alias: [
      {
        find: "server-only",
        replacement: path.resolve(dirname, "test/stubs/server-only.ts"),
      },
      { find: /^@\/(.*)$/, replacement: path.resolve(dirname, "$1") },
    ],
  },
});
