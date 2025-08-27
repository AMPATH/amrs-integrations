import { HieHttpClient } from "../../utils/http-client";
import config from "../../config/env";
import { AmrsService } from "../amrs/amrs.service";
import { logger } from "../../utils/logger";

export interface HwrResponse {
  message: {
    registration_number: number;
    found: number;
    is_active: boolean;
    name?: string;
    specialization?: string;
    license_status?: string;
  };
}

export class HwrService {
  private httpClient = new HieHttpClient();
  private amrsService = new AmrsService();

  async fetchPractitionerFromHie(nationalId: string, idType: string = 'national-id'): Promise<HwrResponse> {
    try {
      const response = await this.httpClient.get<HwrResponse>(
        config.HIE.HWR_URL,
        {
          identification_type: idType,
          identification_number: nationalId
        }
      );

      if (response.data.message.found === 0) {
        throw new Error("Practitioner not found in HWR");
      }

      return response.data;
    } catch (error: any) {
      // console.log("error", error);
      logger.error(`HIE HWR request failed: ${error.message}`);
      throw new Error(
        `Failed to fetch practitioner from HIE: ${
          error.response?.data || error.message
        }`
      );
    }
  }

  async updateLicenseStatus(
    nationalId: string,
    providerUuid?: string,
    idType: string = 'national-id'
  ): Promise<any> {
    const practitioner = await this.fetchPractitionerFromHie(nationalId);
    
    // Extract license status from response
    const licenseStatus = practitioner.message.is_active ? "active" : "inactive";
    const registrationNumber = practitioner.message.registration_number;

    // If provider UUID is not provided, try to find by national ID
    let targetUuid = providerUuid;
    if (!targetUuid) {
      const provider = await this.amrsService.findProviderByIdentifier(
        nationalId
      );
      targetUuid = provider?.uuid;
    }

    if (!targetUuid) {
      throw new Error(
        `Provider not found in AMRS for national ID: ${nationalId}`
      );
    }

    return this.amrsService.updateProvider(targetUuid, {
      licenseStatus,
      // registrationNumber
    });
  }
}