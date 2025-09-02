import { HieHttpClient } from "../../utils/http-client";
import config from "../../config/env";
import { logger } from "../../utils/logger";
import { FacilitySearchResponse } from "../../types/hie.type";

export class FacilityRegistryService {
  private httpClient = new HieHttpClient();

  async searchFacilityByCode(facilityCode: string): Promise<FacilitySearchResponse> {
    try {
      const response = await this.httpClient.get<FacilitySearchResponse>(
        config.HIE.FACILITY_SEARCH_URL,
        {
          facility_code: facilityCode,
        }
      );

      if (response.data.message.found === 0) {
        throw new Error(`Facility not found for code: ${facilityCode}`);
      }

      return response.data;
    } catch (error: any) {
      logger.error(`HIE Facility Registry request failed: ${error.message}`);
      throw new Error(
        `Failed to fetch facility from HIE: ${error.response?.data?.error_msg || error.message}`
      );
    }
  }
}
