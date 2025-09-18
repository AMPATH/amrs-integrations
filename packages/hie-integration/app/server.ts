import Hapi from '@hapi/hapi';
import hapiPino from 'hapi-pino';
import { logger } from './utils/logger';
import { routes } from './routes/routes';
import { DatabaseManager } from './config/database';

export const initServer = async () => {
  // Initialize database connections
  try {
    const dbManager = DatabaseManager.getInstance();
    await dbManager.initializeAll();
    
    // Get server configuration from database manager
    const serverConfig = dbManager.getServerConfig();
    
    const server = Hapi.server({
      port: serverConfig.port,
      host: serverConfig.host,
      routes: {
        cors: true,
        validate: {
          failAction: async (request, h, err: any) => {
            if (process.env.NODE_ENV === 'production') {
              throw err;
            }
            logger.warn(`Validation error: ${err.message}`);
            throw err;
          }
        }
      }
    });

    await server.register([
      {
        plugin: hapiPino as unknown as Hapi.Plugin<hapiPino.Options>,
        options: {
          instance: logger,
          logEvents: ['request', 'response', 'onPostStart'],
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          transport: process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty' }
            : undefined,
          mergeHapiLogData: true
        }
      }
    ]);

    server.route(routes());

    server.ext('onPreResponse', (request, h) => {
      const response = request.response as any;
      if (response.isBoom) {
        const error = response;
        request.logger.error(error);

        if (error.data && error.data.details) {
          const details = error.data.details.map((d: any) => ({
            message: d.message,
            path: d.path
          }));

          return h.response({
            error: 'Validation failed',
            details
          }).code(error.output.statusCode);
        }

        return h.response({
          error: error.message,
          details: error.data?.details
        }).code(error.output.statusCode);
      }
      return h.continue;
    });

    return server;
  } catch (error) {
    console.log("error", error)
    logger.error('Failed to initialize server:', error);
    process.exit(1);
  }
};

export const startServer = async () => {
  const server = await initServer();
  await server.start();
  server.logger.info(`Server running on ${server.info.uri}`);
  return server;
};

process.on('unhandledRejection', (err) => {
  logger.error(err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  logger.info('Shutting down server...');
  const dbManager = DatabaseManager.getInstance();
  await dbManager.closeAll();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down server...');
  const dbManager = DatabaseManager.getInstance();
  await dbManager.closeAll();
  process.exit(0);
});