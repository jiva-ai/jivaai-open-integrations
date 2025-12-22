/**
 * Logger utility for the Jiva.ai Agent Chat SDK
 */

import { LogLevel, Logger, LoggingConfig } from './types';

/**
 * Log level hierarchy (lower number = more verbose)
 */
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

/**
 * Default console logger implementation
 */
export class ConsoleLogger implements Logger {
  debug(message: string, ...args: unknown[]): void {
    if (typeof console.debug === 'function') {
      console.debug(`[DEBUG] ${message}`, ...args);
    } else {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    console.info(`[INFO] ${message}`, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(`[WARN] ${message}`, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    console.error(`[ERROR] ${message}`, ...args);
  }
}

/**
 * No-op logger that discards all log messages
 */
class SilentLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

/**
 * Creates a logger instance based on configuration
 */
export function createLogger(config?: LoggingConfig): Logger {
  // If logging is explicitly disabled, return silent logger
  if (config?.enabled === false) {
    return new SilentLogger();
  }

  // Use custom logger if provided
  if (config?.logger) {
    return new LogLevelFilter(config.logger, config.level || 'warn');
  }

  // Determine default log level
  const defaultLevel: LogLevel =
    process.env.NODE_ENV === 'production' ? 'warn' : 'debug';

  const level = config?.level || defaultLevel;
  const consoleLogger = new ConsoleLogger();

  return new LogLevelFilter(consoleLogger, level);
}

/**
 * Logger wrapper that filters messages based on log level
 */
class LogLevelFilter implements Logger {
  private minLevel: number;

  constructor(private logger: Logger, level: LogLevel) {
    this.minLevel = LOG_LEVELS[level];
  }

  debug(message: string, ...args: unknown[]): void {
    if (LOG_LEVELS.debug >= this.minLevel) {
      this.logger.debug(message, ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (LOG_LEVELS.info >= this.minLevel) {
      this.logger.info(message, ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (LOG_LEVELS.warn >= this.minLevel) {
      this.logger.warn(message, ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (LOG_LEVELS.error >= this.minLevel) {
      this.logger.error(message, ...args);
    }
  }
}

