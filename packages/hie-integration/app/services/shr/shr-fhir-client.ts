import axios from "axios";
import { logger } from "../../utils/logger";
import config from "../../config/env";


export class ShrFhirClient {
  constructor(facilityUuid: string) {
    // No client needed, using axios directly
  }

  async postBundle(bundle: any): Promise<any> {
    try {
      const fullUrl = `${config.HIE.OPENHIM_BASE_URL}${config.HIE.OPENHIM_FHIR_ENDPOINT}`;
      logger.info(`[OPENHIM SHR] Attempting to post bundle to OpenHIM`, {
        fullUrl,
        baseUrl: config.HIE.OPENHIM_BASE_URL,
        endpoint: config.HIE.OPENHIM_FHIR_ENDPOINT,
        bundleId: bundle.id,
        bundleType: bundle.resourceType,
        entryCount: bundle.entry?.length || 0,
        hasAuth: !!(config.HIE.OPENHIM_USERNAME && config.HIE.OPENHIM_PASSWORD),
      });
      
      // Call OpenHIM FHIR endpoint using plain axios
      const response = await axios.post(fullUrl, bundle, {
        headers: {
          'Content-Type': 'application/json',
        },
        auth: config.HIE.OPENHIM_USERNAME && config.HIE.OPENHIM_PASSWORD ? {
          username: config.HIE.OPENHIM_USERNAME,
          password: config.HIE.OPENHIM_PASSWORD,
        } : undefined,
      });
      
      logger.info(`[OPENHIM SHR] ✓ Bundle posted to OpenHIM successfully`, {
        bundleId: bundle.id,
        status: response.status,
        fullUrl,
      });
      return response.data;
    } catch (error: any) {
      const errorDetails = {
        bundleId: bundle.id,
        fullUrl: `${config.HIE.OPENHIM_BASE_URL}${config.HIE.OPENHIM_FHIR_ENDPOINT}`,
        baseUrl: config.HIE.OPENHIM_BASE_URL,
        endpoint: config.HIE.OPENHIM_FHIR_ENDPOINT,
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: JSON.stringify(error.response?.data),
        errorMessage: error.message,
        errorCode: error.code,
        hasAuth: !!(config.HIE.OPENHIM_USERNAME && config.HIE.OPENHIM_PASSWORD),
      };
      
      logger.error(`[OPENHIM SHR] ✗ Failed to post bundle to OpenHIM`, errorDetails);
      throw new Error(`Failed to post bundle to OpenHIM: ${error.message}`);
    }
  }
}
