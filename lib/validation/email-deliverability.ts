import { logger } from '@/lib/logging/safe-logger';

export interface EmailDeliverabilityResult {
  isValid: boolean;
  deliverability: string;
  reason: string | null;
  wasChecked: boolean;
}

/**
 * Checks email deliverability via Abstract Email Reputation API.
 * Endpoint: https://emailreputation.abstractapi.com/v1
 * Returns isValid: true with wasChecked: false on any failure (graceful degradation).
 */
export async function checkEmailDeliverability(
  email: string,
): Promise<EmailDeliverabilityResult> {
  const apiKey = process.env.ABSTRACT_EMAIL_API_KEY;

  if (!apiKey) {
    logger.warn('ABSTRACT_EMAIL_API_KEY not configured, skipping email deliverability check');
    return { isValid: true, deliverability: 'SKIPPED', reason: null, wasChecked: false };
  }

  try {
    const url = `https://emailreputation.abstractapi.com/v1/?api_key=${encodeURIComponent(apiKey)}&email=${encodeURIComponent(email)}`;

    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      logger.warn('Abstract API returned non-OK status', { status: response.status });
      return { isValid: true, deliverability: 'ERROR', reason: null, wasChecked: false };
    }

    const data = await response.json();
    const ed = data.email_deliverability ?? {};
    const deliverability: string = (ed.status || 'unknown').toLowerCase();
    const isMxValid: boolean = ed.is_mx_valid ?? true;
    const isSmtpValid: boolean = ed.is_smtp_valid ?? true;
    const isFormatValid: boolean = ed.is_format_valid ?? true;

    if (!isFormatValid) {
      return {
        isValid: false,
        deliverability,
        reason: 'This email address format is invalid.',
        wasChecked: true,
      };
    }

    if (deliverability === 'undeliverable') {
      let reason = 'This email address appears to be undeliverable.';
      if (!isMxValid) reason = 'This email domain does not exist or cannot receive email.';
      else if (!isSmtpValid) reason = 'This email address was rejected by the mail server.';
      return { isValid: false, deliverability, reason, wasChecked: true };
    }

    if (!isMxValid) {
      return {
        isValid: false,
        deliverability,
        reason: 'This email domain does not exist or cannot receive email.',
        wasChecked: true,
      };
    }

    if (deliverability === 'risky' && !isSmtpValid) {
      return {
        isValid: false,
        deliverability,
        reason: 'This email address could not be verified and may not receive messages.',
        wasChecked: true,
      };
    }

    return { isValid: true, deliverability, reason: null, wasChecked: true };
  } catch (err) {
    logger.warn('Email deliverability check failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { isValid: true, deliverability: 'ERROR', reason: null, wasChecked: false };
  }
}
