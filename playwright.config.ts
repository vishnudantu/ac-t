import { defineConfig } from '@playwright/test'

const database = process.env.ACA_E2E_DATABASE
if (!database || !/^aca_e2e_[0-9a-f]{32}$/.test(database)
  || process.env.DATABASE_URL !== 'postgresql://aca_local@127.0.0.1:55479/' + database
  || !process.env.ACA_E2E_PASSWORD) {
  throw new Error('Run npm.cmd run test:e2e to provision an isolated local test database.')
}

const baseURL = 'http://127.0.0.1:53940'
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: { baseURL, channel: 'chrome', trace: 'retain-on-failure' },
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 53940',
    url: baseURL + '/login',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
