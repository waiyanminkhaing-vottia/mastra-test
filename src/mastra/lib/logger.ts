import { type LogLevel, PinoLogger } from '@mastra/loggers';

// Create the main logger instance
export const logger = new PinoLogger({
  name: 'Mastra',
  level: (process.env.LOG_LEVEL as LogLevel) ?? 'info',
});

/**
 * Log errors with full context and structured error information
 * @param message Descriptive message about the error
 * @param error The error object to log
 * @param context Additional context data to include in the log
 */
export function logError(
  message: string,
  error: Error,
  context?: Record<string, unknown>
) {
  logger.error(message, {
    error: error instanceof Error ? error.message : String(error),
    ...context,
  });
}

// Export the main logger as default
export default logger;
