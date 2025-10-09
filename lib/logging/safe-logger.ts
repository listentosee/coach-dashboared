/**
 * FERPA-Compliant Safe Logger
 *
 * Sanitizes PII from log messages to prevent sensitive data exposure.
 * Use this instead of console.log/error/warn for all logging operations.
 */

/**
 * List of PII field names to redact from logs
 */
const PII_FIELDS = [
  'email',
  'email_personal',
  'email_school',
  'parent_email',
  'first_name',
  'last_name',
  'parent_name',
  'gender',
  'race',
  'ethnicity',
  'phone',
  'phone_number',
  'address',
  'street',
  'city',
  'state',
  'zip',
  'postal_code',
  'ssn',
  'date_of_birth',
  'dob',
  'birth_date',
];

/**
 * List of sensitive pattern keywords to redact
 */
const SENSITIVE_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email addresses
  /\b\d{3}-\d{2}-\d{4}\b/g, // SSN format
  /\b\d{3}-\d{3}-\d{4}\b/g, // Phone number format
];

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/**
 * Sanitizes an object by redacting PII fields
 */
function sanitizePII(obj: any, depth = 0): any {
  // Prevent infinite recursion
  if (depth > 10) return '[MAX_DEPTH]';

  if (obj === null || obj === undefined) return obj;

  // Handle primitive types
  if (typeof obj !== 'object') {
    if (typeof obj === 'string') {
      // Redact sensitive patterns in strings
      let sanitized = obj;
      for (const pattern of SENSITIVE_PATTERNS) {
        sanitized = sanitized.replace(pattern, '[REDACTED]');
      }
      return sanitized;
    }
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizePII(item, depth + 1));
  }

  // Handle Error objects specially
  if (obj instanceof Error) {
    return {
      name: obj.name,
      message: sanitizePII(obj.message, depth + 1),
      // Don't include stack trace to prevent PII leakage
      stack: '[REDACTED]',
    };
  }

  // Handle regular objects
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();

    // Check if this key matches any PII field
    const isPIIField = PII_FIELDS.some(field =>
      lowerKey.includes(field.toLowerCase())
    );

    if (isPIIField) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizePII(value, depth + 1);
    } else if (typeof value === 'string') {
      // Check string values for sensitive patterns
      let sanitizedValue = value;
      for (const pattern of SENSITIVE_PATTERNS) {
        sanitizedValue = sanitizedValue.replace(pattern, '[REDACTED]');
      }
      sanitized[key] = sanitizedValue;
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Safe logging function that sanitizes PII before logging
 *
 * @param level - Log level (error, warn, info, debug)
 * @param message - Log message
 * @param context - Optional context object (will be sanitized)
 *
 * @example
 * safeLog('error', 'Failed to update competitor', { error, competitorId: '123' });
 *
 * @example
 * safeLog('info', 'User action completed', { action: 'create', userId: '456' });
 */
export function safeLog(level: LogLevel, message: string, context?: any): void {
  const sanitizedContext = context ? sanitizePII(context) : undefined;

  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

  if (sanitizedContext !== undefined) {
    console[level](prefix, message, sanitizedContext);
  } else {
    console[level](prefix, message);
  }
}

/**
 * Convenience methods for common log levels
 */
export const logger = {
  error: (message: string, context?: any) => safeLog('error', message, context),
  warn: (message: string, context?: any) => safeLog('warn', message, context),
  info: (message: string, context?: any) => safeLog('info', message, context),
  debug: (message: string, context?: any) => safeLog('debug', message, context),
};

/**
 * For testing: expose sanitizePII function
 */
export { sanitizePII };
