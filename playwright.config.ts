import { defineConfig } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config()

const BASE_URL = process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: BASE_URL,
    storageState: 'playwright/.auth/admin.json',
  },
  reporter: [['list']],
  globalSetup: 'tests/setup/auth.global.ts',
})
