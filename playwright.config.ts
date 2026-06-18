import { defineConfig, devices } from '@playwright/test'

// The simulation renders through a Web Worker + OffscreenCanvas, which Chromium
// supports headlessly; WebKit/Firefox would hit the "unsupported environment"
// notice, so the smoke suite runs on Chromium only. It exercises the production
// build (the thing that actually ships) on a dedicated port, so it never collides
// with — or reuses — a `next dev` server (whose dev overlay would intercept clicks).
const PORT = 3100
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Fail the CI build if a `.only` was left in the source.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Run the production server. In CI the build runs as a separate step first;
    // locally Playwright builds on demand so `npm run test:e2e` works from clean.
    command: process.env.CI
      ? `npx next start -p ${PORT}`
      : `npm run build && npx next start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
