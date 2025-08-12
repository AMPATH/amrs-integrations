import { startServer } from './server';

const start = async () => {
  try {
    await startServer();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

start();