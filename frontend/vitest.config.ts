import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Kept apart from vite.config.ts so the production build's type checking does
 * not have to know about test-only options.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // jsdom supplies sessionStorage and localStorage, which the token store
    // needs in order to be tested at all.
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
