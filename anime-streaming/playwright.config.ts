import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env.CI;

// Backend overrides for a deterministic run: sign-up signs straight in (no email
// step), no Have-I-Been-Pwned call and no Jikan seeding over the network.
// Passed as Spring args because relaxed env binding would drop the dashes
// (ANIFIRE_SECURITY_AUTOVERIFYEMAIL), which is easy to get silently wrong.
const backendArgs = [
  "--anifire.security.auto-verify-email=true",
  "--anifire.security.breach-check-enabled=false",
  "--anifire.seed.enabled=false",
].join(" ");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Locally the Spring docker-compose integration starts Postgres itself;
      // CI provides a postgres service and disables it via env.
      command: `./gradlew bootRun --console=plain --args='${backendArgs}'`,
      cwd: "../anime-backend/anime-backend",
      url: "http://localhost:8080/api/v1/animes",
      reuseExistingServer: !CI,
      timeout: 240_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: CI ? "npm run start" : "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
  ],
});
