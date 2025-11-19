/**
 * SMS Provider Abstraction Layer (Deno version for Edge Functions)
 * Allows easy swapping between SMS providers (Twilio, AWS SNS, etc.)
 */

export interface SmsProvider {
  /**
   * Send an SMS message
   * @param phoneNumber - E.164 format phone number (e.g., +14155551234)
   * @param message - SMS message content
   * @param options - Optional provider-specific options
   * @returns Promise with result containing success status and message ID
   */
  sendSms(
    phoneNumber: string,
    message: string,
    options?: SmsOptions
  ): Promise<SmsResult>;

  /**
   * Get provider name for logging/debugging
   */
  getName(): string;
}

export interface SmsOptions {
  /**
   * Optional sender ID or phone number
   */
  senderId?: string;

  /**
   * Optional metadata for tracking/logging
   */
  metadata?: Record<string, string>;
}

export interface SmsResult {
  /**
   * Whether the SMS was sent successfully
   */
  success: boolean;

  /**
   * Provider's message ID (for tracking)
   */
  messageId?: string;

  /**
   * Error message if failed
   */
  error?: string;

  /**
   * Provider name that handled the request
   */
  provider: string;
}

export type SmsProviderType = 'twilio' | 'aws-sns';
