import type { SmsProvider, SmsProviderType } from './types.ts';
import { TwilioProvider } from './twilio.ts';
import { AwsSnsProvider } from './aws-sns.ts';

/**
 * SMS Service Factory (Deno version for Edge Functions)
 * Creates the appropriate SMS provider based on environment configuration
 */
export function createSmsProvider(): SmsProvider {
  const providerType = (Deno.env.get('SMS_PROVIDER') || 'twilio') as SmsProviderType;

  switch (providerType) {
    case 'twilio':
      return new TwilioProvider({
        accountSid: Deno.env.get('TWILIO_ACCOUNT_SID') || '',
        authToken: Deno.env.get('TWILIO_AUTH_TOKEN') || '',
        fromNumber: Deno.env.get('TWILIO_FROM_NUMBER') || '',
      });

    case 'aws-sns':
      return new AwsSnsProvider({
        region: Deno.env.get('AWS_REGION') || 'us-west-2',
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID') || '',
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY') || '',
        phonePoolId: Deno.env.get('AWS_PHONE_POOL_ID'),
        configurationSetName: Deno.env.get('AWS_CONFIGURATION_SET_NAME'),
      });

    default:
      throw new Error(`Unknown SMS provider: ${providerType}. Valid options: twilio, aws-sns`);
  }
}
