import type { SmsProvider, SmsOptions, SmsResult } from './types.ts';

/**
 * Twilio SMS Provider (Deno version)
 * Docs: https://www.twilio.com/docs/sms/api
 */
export class TwilioProvider implements SmsProvider {
  private accountSid: string;
  private authToken: string;
  private fromNumber: string;

  constructor(config: {
    accountSid: string;
    authToken: string;
    fromNumber: string;
  }) {
    this.accountSid = config.accountSid;
    this.authToken = config.authToken;
    this.fromNumber = config.fromNumber;

    if (!this.accountSid || !this.authToken || !this.fromNumber) {
      throw new Error('Twilio requires accountSid, authToken, and fromNumber');
    }
  }

  getName(): string {
    return 'twilio';
  }

  async sendSms(
    phoneNumber: string,
    message: string,
    options?: SmsOptions
  ): Promise<SmsResult> {
    try {
      // Twilio API endpoint
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;

      // Create Basic Auth header (using btoa for base64 encoding in Deno)
      const credentials = btoa(`${this.accountSid}:${this.authToken}`);

      // Build request body
      const body = new URLSearchParams({
        To: phoneNumber,
        From: options?.senderId || this.fromNumber,
        Body: message,
      });

      // Send request to Twilio
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('[TwilioProvider] Full error response:', {
          status: response.status,
          statusText: response.statusText,
          data,
          url,
          accountSidExists: !!this.accountSid,
          authTokenExists: !!this.authToken,
          fromNumberExists: !!this.fromNumber,
        });
        return {
          success: false,
          error: data.message || `Twilio API error: ${response.status}`,
          provider: this.getName(),
        };
      }

      // Twilio returns SID as message identifier
      return {
        success: true,
        messageId: data.sid,
        provider: this.getName(),
      };
    } catch (error) {
      console.error('[TwilioProvider] Exception:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: this.getName(),
      };
    }
  }
}
