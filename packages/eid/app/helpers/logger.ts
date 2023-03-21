import { createLogger, format, transports } from 'winston';
import * as logform from 'logform';

const myFormat = format.printf(({ level, message, label, timestamp, filename }) => {
return JSON.stringify({ timestamp, label, level, message, filename });
});

const logger = createLogger({
  format: format.combine(
    format.label({ label: 'Csv File logs' }),
    format.timestamp(),
    myFormat
  ),
  transports: [
    new transports.File({ filename: 'logs.log' }),
  ],
});

function logToFile(filename: string, errorType: 'info' | 'error', message: string) {
    const level = errorType === 'error' ? 'error' : 'info';
    const logMessage = {
      level,
      message,
      filename,
      timestamp: new Date(),
    };
    logger.log(logMessage);
  }


export { logToFile };
