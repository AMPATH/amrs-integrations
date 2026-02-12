import axios from "axios";
import { logger } from "../../utils/logger";
import config from "../../config/env";
import { TokenService } from "../../services/auth/token.service";

export class ShrFhirClient {
  private facilityUuid: string;
  private tokenService: TokenService;

  constructor(facilityUuid: string) {
    this.facilityUuid = facilityUuid;
    this.tokenService = new TokenService();
  }

  async postBundle(bundle: any): Promise<any> {
    try {
      const fullUrl = `${config.HIE.BASE_URL}${config.HIE.SHR_POST_BUNDLE_URL}`;
      
      // Log the complete transformed bundle being sent to OpenHIM
      logger.info(`[OPENHIM SHR] Posting transformed bundle to OpenHIM`, {
        fullUrl,
        facilityUuid: this.facilityUuid,
        bundleId: bundle.id,
        bundleType: bundle.resourceType,
        entryCount: bundle.entry?.length || 0,
        resourceTypes: bundle.entry?.map((e: any) => e.resource?.resourceType),
        transformedPayload: JSON.stringify(bundle, null, 2)
      });
      
      console.log("facilityUuid", this.facilityUuid, bundle.entry?.length || 0);
      const token = await this.tokenService.getAccessToken(this.facilityUuid);
      console.log("token", token);
      const response = await axios.post(fullUrl, bundle, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      console.log("response", response);
      logger.info(`[OPENHIM SHR] ✓ Bundle posted to OpenHIM successfully`, {
        bundleId: bundle.id,
        status: response.status,
        fullUrl,
      });
      return response.data;
    } catch (error: any) {
      const errorDetails = {
        bundleId: bundle.id,
        fullUrl: `${config.HIE.BASE_URL}${config.HIE.SHR_POST_BUNDLE_URL}`,
        status: error.response?.status,
        responseData: error.response?.data,
        errorMessage: error.message,
      };

      logger.error(
        `[OPENHIM SHR] ✗ Failed to post bundle to OpenHIM`,
        errorDetails
      );
      throw new Error(`Failed to post bundle to OpenHIM: ${error.message}`);
    }
  }

}
