import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 180000,
  expect: { timeout: 15000 },
  workers: 1,
  use: {
    baseURL: process.env.WAYPOINT_URL || "http://localhost:8080",
    trace: "retain-on-failure",
    actionTimeout: 20000,
  },
  outputDir: "../../tmp/browser-results",
  reporter: [["list"]],
});
