declare module 'openhim-mediator-utils' {
  export function registerMediator(
    openhimConfig: any,
    mediatorConfig: any,
    callback: (err?: any) => void
  ): void;

  export function activateHeartbeat(openhimConfig: any): void;

  export function fetchConfig(
    openhimConfig: any,
    callback: (err?: any, config?: any) => void
  ): void;
}