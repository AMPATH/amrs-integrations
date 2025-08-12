import pino from 'pino';

// 1. Extend pino.Logger to include audit()
interface AuditLogger extends pino.Logger {
  audit: (message: string, data?: object) => void;
}

// 2. Create logger with extended type
const logger: AuditLogger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
  messageKey: 'message',
  base: {
    service: 'hie-integration',
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  redact: {
    paths: [
      'password',
      '*.password',
      '*.authorization',
      'headers.authorization',
    ],
    censor: '**REDACTED**',
  },
}) as AuditLogger;

// 3. Add custom audit method
logger.audit = (message: string, data: object = {}) => {
  logger.info({ ...data, audit: true }, `AUDIT: ${message}`);
};

export { logger };
