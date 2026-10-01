import { defineConfig, devices } from "@playwright/test";

// Use the browser preinstalled in CI/cloud images when the bundled one is absent.
const executablePath = process.env.RB_CHROMIUM || undefined;

export default defineConfig({
  testDir: "./tests",
  testMatch: ["e2e/**/*.spec.ts", "a11y/**/*.spec.ts"],
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:3301",
    trace: "retain-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions: { executablePath } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } } },
  ],
  webServer: {
    // Tests run against the production build: `npm run build` first.
    command: "npx next start -p 3301",
    url: "http://127.0.0.1:3301",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
