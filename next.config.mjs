console.log('[env-check] Loaded next.config.mjs from:', new URL('', import.meta.url).pathname)
console.log('[env-check] CWD =', process.cwd())
console.log('[env-check] SUPABASE_URL =', process.env.SUPABASE_URL ?? '(missing)')
console.log('[env-check] SERVICE KEY =', process.env.SUPABASE_SERVICE_ROLE_KEY
  ? `${process.env.SUPABASE_SERVICE_ROLE_KEY.slice(0,6)}...${process.env.SUPABASE_SERVICE_ROLE_KEY.slice(-6)}`
  : '(missing)'
)
console.log('[env-check] ANON KEY =', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ? `${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.slice(0,6)}...${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.slice(-6)}`
  : '(missing)'
)
let userConfig = undefined

if (!process.env.NEXT_DISABLE_DEVTOOLS) {
  process.env.NEXT_DISABLE_DEVTOOLS = '1';
}
try {
  // try to import ESM first
  userConfig = await import('./v0-user-next.config.mjs')
} catch (e) {
  try {
    // fallback to CJS import
    userConfig = await import("./v0-user-next.config");
  } catch (innerError) {
    // ignore error
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000',
    NEXT_DISABLE_DEVTOOLS: process.env.NEXT_DISABLE_DEVTOOLS || '1',
  },
  experimental: {
    webpackBuildWorker: true,
    parallelServerBuildTraces: true,
    parallelServerCompiles: true,
    instrumentationHook: true, // Enable instrumentation for background services
  },
  serverExternalPackages: ['playwright-core', '@sparticuz/chromium'],
}

if (userConfig) {
  // ESM imports will have a "default" property
  const config = userConfig.default || userConfig

  for (const key in config) {
    if (
      typeof nextConfig[key] === 'object' &&
      !Array.isArray(nextConfig[key])
    ) {
      nextConfig[key] = {
        ...nextConfig[key],
        ...config[key],
      }
    } else {
      nextConfig[key] = config[key]
    }
  }
}

export default nextConfig
