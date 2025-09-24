import 'pino';

declare module 'pino' {
  interface Logger {
    audit(message: string, data?: object): void;
  }
}
