import { startServer } from './server';
import { logger } from './utils/logger';

const start = async () => {
  try {
    await startServer();
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

start();