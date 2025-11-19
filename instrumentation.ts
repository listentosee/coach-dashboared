/**
 * Next.js Instrumentation Hook
 * Runs when the server starts - perfect for background services
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startInstantSmsService } = await import('./lib/sms/instant-sms-service')
    await startInstantSmsService()
  }
}
