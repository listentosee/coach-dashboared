import { SNSClient, PublishCommand } from 'https://esm.sh/@aws-sdk/client-sns@3.651.1';
import type { SmsProvider, SmsOptions, SmsResult } from './types.ts';

/**
 * AWS SNS SMS Provider (Deno version)
 * Docs: https://docs.aws.amazon.com/sns/latest/dg/sms_publish-to-phone.html
 */
export class AwsSnsProvider implements SmsProvider {
  private region: string;
  private accessKeyId: string;
  private secretAccessKey: string;
  private phonePoolId?: string;
  private configurationSetName?: string;

  constructor(config: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    phonePoolId?: string;
    configurationSetName?: string;
  }) {
    this.region = config.region;
    this.accessKeyId = config.accessKeyId;
    this.secretAccessKey = config.secretAccessKey;
    this.phonePoolId = config.phonePoolId;
    this.configurationSetName = config.configurationSetName;

    if (!this.region || !this.accessKeyId || !this.secretAccessKey) {
      throw new Error('AWS SNS requires region, accessKeyId, and secretAccessKey');
    }
  }

  getName(): string {
    return 'aws-sns';
  }

  async sendSms(
    phoneNumber: string,
    message: string,
    options?: SmsOptions
  ): Promise<SmsResult> {
    try {
      const client = new SNSClient({
        region: this.region,
        credentials: {
          accessKeyId: this.accessKeyId,
          secretAccessKey: this.secretAccessKey,
        },
      });

      // Build message attributes
      const messageAttributes: any = {
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional', // Use transactional for important messages
        },
      };

      // Add phone pool and configuration set if provided
      if (this.phonePoolId) {
        messageAttributes['AWS.MM.SMS.OriginationNumber'] = {
          DataType: 'String',
          StringValue: this.phonePoolId,
        };
      }

      if (this.configurationSetName) {
        messageAttributes['AWS.SNS.SMS.ConfigurationSetName'] = {
          DataType: 'String',
          StringValue: this.configurationSetName,
        };
      }

      const command = new PublishCommand({
        PhoneNumber: phoneNumber,
        Message: message,
        MessageAttributes: messageAttributes,
      });

      const response = await client.send(command);

      if (!response.MessageId) {
        return {
          success: false,
          error: 'AWS SNS did not return a MessageId',
          provider: this.getName(),
        };
      }

      return {
        success: true,
        messageId: response.MessageId,
        provider: this.getName(),
      };
    } catch (error) {
      console.error('[AwsSnsProvider] Exception:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: this.getName(),
      };
    }
  }
}
