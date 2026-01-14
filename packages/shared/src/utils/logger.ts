// ===========================================
// Logger Utility
// ===========================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext, error?: Error): void;
}

const LOG_LEVEL = (process.env.LOG_LEVEL ?? 'info') as LogLevel;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const levelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  return levelPriority[level] >= levelPriority[LOG_LEVEL];
}

function formatMessage(level: LogLevel, message: string, context?: LogContext, error?: Error): string {
  const timestamp = new Date().toISOString();
  
  if (IS_PRODUCTION) {
    // JSON format for production
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...context,
      ...(error && { error: { message: error.message, stack: error.stack } }),
    });
  }
  
  // Pretty format for development
  const levelColors: Record<LogLevel, string> = {
    debug: '\x1b[36m', // cyan
    info: '\x1b[32m',  // green
    warn: '\x1b[33m',  // yellow
    error: '\x1b[31m', // red
  };
  
  const reset = '\x1b[0m';
  const dim = '\x1b[2m';
  
  let output = `${dim}${timestamp}${reset} ${levelColors[level]}${level.toUpperCase().padEnd(5)}${reset} ${message}`;
  
  if (context && Object.keys(context).length > 0) {
    output += ` ${dim}${JSON.stringify(context)}${reset}`;
  }
  
  if (error) {
    output += `\n${levelColors.error}${error.stack ?? error.message}${reset}`;
  }
  
  return output;
}

export const logger: Logger = {
  debug(message: string, context?: LogContext): void {
    if (shouldLog('debug')) {
      console.debug(formatMessage('debug', message, context));
    }
  },
  
  info(message: string, context?: LogContext): void {
    if (shouldLog('info')) {
      console.info(formatMessage('info', message, context));
    }
  },
  
  warn(message: string, context?: LogContext): void {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', message, context));
    }
  },
  
  error(message: string, context?: LogContext, error?: Error): void {
    if (shouldLog('error')) {
      console.error(formatMessage('error', message, context, error));
    }
  },
};

/**
 * Create a namespaced logger for a specific component/module
 */
export function createLogger(namespace: string): Logger {
  return {
    debug(message: string, context?: LogContext): void {
      logger.debug(`[${namespace}] ${message}`, context);
    },
    info(message: string, context?: LogContext): void {
      logger.info(`[${namespace}] ${message}`, context);
    },
    warn(message: string, context?: LogContext): void {
      logger.warn(`[${namespace}] ${message}`, context);
    },
    error(message: string, context?: LogContext, error?: Error): void {
      logger.error(`[${namespace}] ${message}`, context, error);
    },
  };
}
