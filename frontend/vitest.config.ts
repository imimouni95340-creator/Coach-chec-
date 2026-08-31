import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // jsdom provides localStorage and crypto.randomUUID, which the game
    // session and the on-device archive rely on.
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
