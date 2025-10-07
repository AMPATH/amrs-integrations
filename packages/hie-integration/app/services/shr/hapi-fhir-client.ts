import { HieHttpClient } from "../../utils/http-client";
import { logger } from "../../utils/logger";
import config from "../../config/env";

export class HapiFhirClient {
  private httpClient: HieHttpClient;

  constructor() {
    this.httpClient = new HieHttpClient(config.HAPI_FHIR.BASE_URL);
  }

  async postBundle(bundle: any): Promise<any> {
    try {
      // Post bundle directly to HAPI-FHIR server
      const response = await this.httpClient.post("/", bundle);
      logger.debug(
        { statusCode: response.status },
        "HAPI FHIR Bundle POST successful"
      );
      return response.data;
    } catch (error: any) {
      logger.error(
        { error, bundleId: bundle.id },
        "Failed to post bundle to HAPI FHIR"
      );
      throw new Error(`Failed to post bundle to HAPI FHIR: ${error.message}`);
    }
  }
}
