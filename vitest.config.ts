import { defineConfig, configDefaults } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    // Playwright drives the e2e specs under e2e/; keep Vitest out of them or it
    // would try to run them under its own runner and fail on the import.
    exclude: [...configDefaults.exclude, 'e2e/**'],
    // Heavy world tests (2000–3000 ticks with DEFAULT_CONFIG) need ~30–45s in CI.
    testTimeout: 90_000,
    coverage: {
      provider: 'v8',
      include: ['sim/**/*.ts'],
      // The worker, renderer and message protocol rely on DOM/Worker globals and
      // can't execute under the node test environment.
      exclude: ['sim/**/__tests__/**', 'sim/sim.worker.ts', 'sim/render.ts', 'sim/protocol.ts'],
    },
  },
})
