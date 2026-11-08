import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        test: {
          name: "web",
          environment: "jsdom",
          setupFiles: ["./src/test-setup.ts"],
          include: ["src/**/*.test.{ts,tsx}", "shared/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "worker",
          environment: "node",
          include: ["worker/**/*.test.ts"],
          testTimeout: 20000,
          hookTimeout: 30000,
        },
      },
    ],
  },
});
