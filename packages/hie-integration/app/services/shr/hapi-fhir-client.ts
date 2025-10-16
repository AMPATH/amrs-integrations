import axios from "axios";
import { logger } from "../../utils/logger";
import config from "../../config/env";

export class HapiFhirClient {
  constructor(facilityUuid: string) {
    // No client needed, using axios directly
  }

  async postBundle(bundle: any): Promise<any> {
    try {
      const fullUrl = `${config.HAPI_FHIR.BASE_URL}`;
      logger.info(`[INTERNAL HAPI] Attempting to post bundle`, {
        fullUrl,
        baseUrl: config.HAPI_FHIR.BASE_URL,
        bundleId: bundle.id,
        bundleType: bundle.resourceType,
        entryCount: bundle.entry?.length || 0,
        hasAuth: !!(config.HAPI_FHIR.USERNAME && config.HAPI_FHIR.PASSWORD),
      });
      
      // Post bundle directly to HAPI-FHIR server using plain axios
      const response = await axios.post(fullUrl, bundle, {
        headers: {
          'Content-Type': 'application/json',
        },
        auth: config.HAPI_FHIR.USERNAME && config.HAPI_FHIR.PASSWORD ? {
          username: config.HAPI_FHIR.USERNAME,
          password: config.HAPI_FHIR.PASSWORD,
        } : undefined,
      });
      
      logger.info(`[INTERNAL HAPI] ✓ Bundle posted successfully`, {
        bundleId: bundle.id,
        status: response.status,
        fullUrl,
      });
      return response.data;
    } catch (error: any) {
      const errorDetails = {
        bundleId: bundle.id,
        fullUrl: `${config.HAPI_FHIR.BASE_URL}/`,
        baseUrl: config.HAPI_FHIR.BASE_URL,
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: JSON.stringify(error.response?.data),
        errorMessage: error.message,
        errorCode: error.code,
        hasAuth: !!(config.HAPI_FHIR.USERNAME && config.HAPI_FHIR.PASSWORD),
        stack: error.stack,
      };
      
      logger.error(`[INTERNAL HAPI] ✗ Failed to post bundle`, errorDetails);
      throw new Error(`Failed to post bundle to HAPI FHIR: ${error.message}`);
    }
  }
}
