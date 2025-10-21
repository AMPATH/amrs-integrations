import { Request, ResponseToolkit } from '@hapi/hapi';
import * as mediatorUtils from 'openhim-mediator-utils';
import { logger } from '../utils/logger';
import config from '../config/env';

export interface MediatorConfig {
  urn: string;
  version: string;
  name: string;
  description: string;
  defaultChannelConfig: any[];
  endpoints: any[];
  configDefs: any[];
}

export interface OrchestrationMetadata {
  name: string;
  request: {
    method: string;
    url: string;
    timestamp: string;
    headers?: Record<string, string>;
    body?: any;
  };
  response: {
    status: number;
    headers?: Record<string, string>;
    body?: any;
    timestamp: string;
  };
}

export interface MediatorResponse {
  'x-mediator-urn': string;
  status: 'Processing' | 'Success' | 'Failed' | 'Completed';
  response: {
    status: number;
    headers: Record<string, string>;
    body: any;
    timestamp: string;
  };
  orchestrations?: OrchestrationMetadata[];
  properties?: Record<string, any>;
}

export class MediatorUtils {
  private static mediatorConfig: MediatorConfig;
  private static openhimConfig: any;

  static async initialize(mediatorConfig: MediatorConfig) {
    this.mediatorConfig = mediatorConfig;
    
    // OpenHIM Core configuration
    this.openhimConfig = {
      username: config.HIE?.OPENHIM_USERNAME || 'root@openhim.org',
      password: config.HIE?.OPENHIM_PASSWORD || 'openhim-password',
      apiURL: config.HIE?.OPENHIM_API_URL || 'https://localhost:8080',
      trustSelfSigned: true,
      urn: mediatorConfig.urn
    };

    logger.info('Initializing mediator with configuration', {
      apiURL: this.openhimConfig.apiURL,
      username: this.openhimConfig.username,
      urn: this.openhimConfig.urn,
      trustSelfSigned: this.openhimConfig.trustSelfSigned,
      mediatorName: mediatorConfig.name,
      mediatorVersion: mediatorConfig.version
    });

    try {
      // Register mediator with OpenHIM Core using the official utils
      await this.registerMediator();
      logger.info('Mediator successfully registered with OpenHIM Core');
    } catch (error: any) {
      logger.warn('Failed to register mediator with OpenHIM Core (this is expected if OpenHIM is not running):', {
        error: error.message,
        apiURL: this.openhimConfig.apiURL,
        suggestion: 'Ensure OpenHIM Core is running and accessible, or update HIE_OPENHIM_BASE_URL environment variable'
      });
      // Don't fail startup if OpenHIM registration fails - this allows development without OpenHIM
    }
  }

  private static async registerMediator() {
    try {
      // First, check if OpenHIM Core is reachable
      logger.info('Checking OpenHIM Core connectivity...');
      
      return new Promise((resolve, reject) => {
        logger.info('Attempting to register mediator with OpenHIM Core', {
          apiURL: this.openhimConfig.apiURL,
          username: this.openhimConfig.username,
          urn: this.openhimConfig.urn
        });
        
        mediatorUtils.registerMediator(
          this.openhimConfig,
          this.mediatorConfig,
          (err: any) => {
            if (err) {
              logger.error('Failed to register mediator:', {
                error: err,
                message: err.message,
                code: err.code,
                config: {
                  apiURL: this.openhimConfig.apiURL,
                  username: this.openhimConfig.username,
                  urn: this.openhimConfig.urn
                }
              });
              reject(err);
            } else {
              logger.info('Mediator registered successfully');
              resolve(true);
            }
          }
        );
      });
    } catch (error: any) {
      logger.error('Failed to register mediator:', {
        error: error,
        message: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  static createMediatorResponse(
    request: Request,
    status: number,
    body: any,
    orchestrations: OrchestrationMetadata[] = [],
    properties: Record<string, any> = {}
  ): MediatorResponse {
    const timestamp = new Date().toISOString();
    
    return {
      'x-mediator-urn': this.mediatorConfig.urn,
      status: status >= 200 && status < 300 ? 'Success' : 'Failed',
      response: {
        status,
        headers: {
          'Content-Type': 'application/json'
        },
        body,
        timestamp
      },
      orchestrations,
      properties
    };
  }

  static createOrchestration(
    name: string,
    method: string,
    url: string,
    requestBody: any,
    responseStatus: number,
    responseBody: any,
    requestHeaders: Record<string, string> = {},
    responseHeaders: Record<string, string> = {}
  ): OrchestrationMetadata {
    const timestamp = new Date().toISOString();
    
    return {
      name,
      request: {
        method,
        url,
        timestamp,
        headers: requestHeaders,
        body: requestBody
      },
      response: {
        status: responseStatus,
        headers: responseHeaders,
        body: responseBody,
        timestamp
      }
    };
  }

  static async sendMediatorResponse(
    h: ResponseToolkit,
    mediatorResponse: MediatorResponse
  ) {
    // Set mediator headers
    return h.response(mediatorResponse.response.body)
      .code(mediatorResponse.response.status)
      .header('X-Mediator-URN', mediatorResponse['x-mediator-urn'])
      .header('Content-Type', 'application/json');
  }

  static activateHeartbeat() {
    if (this.openhimConfig) {
      // Use the official mediator utils for heartbeat
      const heartbeatInterval = setInterval(() => {
        try {
          mediatorUtils.activateHeartbeat(this.openhimConfig);
        } catch (error: any) {
          logger.debug('Heartbeat failed:', error.message);
        }
      }, 30000); // Send heartbeat every 30 seconds
      
      logger.info('Mediator heartbeat activated');
    }
  }

  static async fetchConfig(): Promise<any> {
    try {
      return new Promise((resolve, reject) => {
        mediatorUtils.fetchConfig(this.openhimConfig, (err: any, config: any) => {
          if (err) {
            logger.error('Failed to fetch config:', err);
            reject(err);
          } else {
            resolve(config);
          }
        });
      });
    } catch (error: any) {
      logger.error('Failed to fetch config:', error.message);
      throw error;
    }
  }
}