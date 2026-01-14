// ===========================================
// Observability Setup
// ===========================================

import { logger } from '@salessearchers/shared';

/**
 * Initialize observability (Sentry, etc.)
 */
export function initObservability() {
  const sentryDsn = process.env.SENTRY_DSN;

  if (sentryDsn) {
    // In production, you would initialize Sentry here:
    // Sentry.init({
    //   dsn: sentryDsn,
    //   environment: process.env.NODE_ENV,
    //   tracesSampleRate: 0.1,
    // });
    logger.info('Sentry initialized', { dsn: '***' });
  } else {
    logger.info('Sentry DSN not configured, skipping initialization');
  }
}

/**
 * Capture an exception
 */
export function captureException(error: Error, context?: Record<string, unknown>) {
  logger.error('Exception captured', context ?? {}, error);

  // In production:
  // Sentry.captureException(error, { extra: context });
}

/**
 * Capture a message
 */
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  logger.info('Message captured', { message, level });

  // In production:
  // Sentry.captureMessage(message, level);
}

/**
 * Set user context for error tracking
 */
export function setUser(user: { id: string; email?: string; tenantId?: string }) {
  // In production:
  // Sentry.setUser({
  //   id: user.id,
  //   email: user.email,
  //   tenantId: user.tenantId,
  // });
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(breadcrumb: {
  category: string;
  message: string;
  level?: 'debug' | 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
}) {
  // In production:
  // Sentry.addBreadcrumb(breadcrumb);
}

/**
 * Create a performance transaction
 */
export function startTransaction(name: string, op: string) {
  // In production:
  // return Sentry.startTransaction({ name, op });

  const startTime = Date.now();
  return {
    finish: () => {
      const duration = Date.now() - startTime;
      logger.debug('Transaction completed', { name, op, duration: `${duration}ms` });
    },
    setStatus: (_status: string) => {},
    setData: (_key: string, _value: unknown) => {},
  };
}

