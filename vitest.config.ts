import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["shared/**/*.ts", "server/**/*.ts", "src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "src/main.ts",
        // Canvas rendering is not exercisable under jsdom; its pure helpers are
        // covered indirectly through the UI integration test.
        "src/chart.ts",
        "src/vite-env.d.ts",
        // Bootstrap side effects (listen, process signals, CLI) are not unit-testable.
        "server/index.ts",
        "server/clear.ts",
      ],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
});
