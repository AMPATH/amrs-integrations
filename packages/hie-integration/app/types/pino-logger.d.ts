import 'pino';
import '@hapi/hapi';

declare module 'pino' {
  interface Logger {
    audit: (message: string, data?: object) => void;
  }
}

declare module '@hapi/hapi' {
  interface Server {
    logger: import('pino').Logger;
  }
  interface Request {
    logger: import('pino').Logger;
  }
}
