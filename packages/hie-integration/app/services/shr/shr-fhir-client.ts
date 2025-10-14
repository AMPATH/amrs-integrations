import { HieHttpClient } from "../../utils/http-client";
import { logger } from "../../utils/logger";
import config from "../../config/env";


export class ShrFhirClient {
  private httpClient: HieHttpClient;

  constructor(facilityUuid: string) {
    this.httpClient = new HieHttpClient(config.HIE.OPENHIM_BASE_URL, facilityUuid);
  }

  async postBundle(bundle: any): Promise<any> {
    try {
      // Call OpenHIM kafka channel to post bundle to SHR
      const response = await this.httpClient.post("/v1/shr-med/bundle", bundle);
      logger.debug(
        { statusCode: response.status },
        "SHR Bundle POST successful"
      );
      return response.data;
    } catch (error: any) {
      logger.error(
        { error, bundleId: bundle.id },
        "Failed to post bundle to SHR"
      );
      throw new Error(`Failed to post bundle to SHR: ${error.message}`);
    }
  }
}
