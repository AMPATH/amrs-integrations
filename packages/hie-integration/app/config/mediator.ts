import { MediatorConfig } from '../utils/mediator';
import config from './env';

export const getMediatorConfig = (): MediatorConfig => {
  return {
    "urn": "urn:mediator:amrs-hie-integration",
    "version": "1.0.0",
    "name": "AMRS HIE Integration Mediator",
    "description": "Mediator for AMRS HIE and SHR integration",
    "defaultChannelConfig": [
      {
        "name": "AMRS HIE SHR Summary",
        "urlPattern": "^/v1/shr/summary.*$",
        "routes": [
          {
            "name": "AMRS HIE SHR Summary Route",
            "host": config.MEDIATOR.HOST,
            "port": config.MEDIATOR.PORT,
            "primary": true,
            "type": "http"
          }
        ],
        "allow": ["shr-summary","custom_token_test","instant"],
        "methods": ["GET"],
        "type": "http"
      }
    ],
    "endpoints": [
      {
        "name": "AMRS HIE SHR Summary",
        "host": config.MEDIATOR.HOST,
        "port": config.MEDIATOR.PORT,
        "path": "/v1/shr/summary",
        "type": "http"
      }
    ],
    "configDefs": [
      {
        "param": "shr_base_url",
        "displayName": "SHR Base URL",
        "description": "Base URL for the Shared Health Record",
        "type": "string"
      },
      {
        "param": "openhim_base_url",
        "displayName": "OpenHIM Base URL", 
        "description": "Base URL for OpenHIM FHIR endpoint",
        "type": "string"
      },
      {
        "param": "openhim_username",
        "displayName": "OpenHIM Username",
        "description": "Username for OpenHIM authentication",
        "type": "string"
      },
      {
        "param": "openhim_password",
        "displayName": "OpenHIM Password",
        "description": "Password for OpenHIM authentication",
        "type": "password"
      }
    ]
  };
};

// For backward compatibility, export a default instance
export const mediatorConfig = getMediatorConfig();