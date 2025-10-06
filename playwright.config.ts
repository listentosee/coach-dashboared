import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config()

const BASE_URL = process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Security tests need isolation
  fullyParallel: false,

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'security-auth',
      testMatch: /auth\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'security-authorization',
      testMatch: /authorization\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'security-injection',
      testMatch: /injection\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'security-privacy',
      testMatch: /privacy\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'e2e-game-platform',
      testMatch: /e2e\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'playwright-report/results.json' }],
  ],

  webServer: {
    command: 'pnpm dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
