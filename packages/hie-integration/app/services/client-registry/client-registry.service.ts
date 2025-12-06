import axios from "axios";
import config from "../../config/env";
import { EncryptedClientResp } from "../../types/hie.type";
import { logger } from "../../utils/logger";
import { HieHttpClient } from "../../utils/http-client";
import { decryptData } from "../../utils/decrypt-data";
import { OtpService } from "./otp.service";
import { DatabaseManager } from "../../config/database";
import { HieMappingService } from "../amrs/hie-mapping-service";

export class ClientRegistryService {
  private httpClient: HieHttpClient;
  private otpService: OtpService;
  private hieMappingService: HieMappingService;

  constructor(facilityUuid: string) {
    this.httpClient = new HieHttpClient(config.HIE.BASE_URL, facilityUuid);
    this.otpService = new OtpService(facilityUuid);
    this.hieMappingService = new HieMappingService();
  }

  async fetchPatientFromHie(
    identificationNumber: string,
    idType: string = "National ID",
    locationUuid: string
  ): Promise<any> {
    try {
      const agent = await this.hieMappingService.getAgentUsingLocationUuid(
        locationUuid
      );
      const response = await this.httpClient.get<EncryptedClientResp>(
        config.HIE.CLIENT_REGISTRY_URL,
        {
          identification_type: idType,
          identification_number: identificationNumber,
          agent: agent,
        }
      );

      if (!response.data || response.data.message.total === 0) {
        throw new Error("Patient not found in HIE registry");
      }

      if (response.data.message.result) {
        const facilityCode = await this.hieMappingService.getFacilityCodeUsingLocationUuid(
          locationUuid
        );
        if (!facilityCode)
          throw new Error(
            `Facility code not found for location ${locationUuid}`
          );

        const results = response.data.message.result || [];
        const patientData = [];
        for (let i = 0; i < results.length; i++) {
          const decrypedData = await decryptData(results[i]._pii, facilityCode);
          patientData.push(decrypedData);
        }
        return patientData;
      }
      return response.data.message.result || [];
    } catch (error: any) {
      logger.error(`HIE client registry request failed: ${error.message}`);
      throw error;
    }
  }

  async sendOtp(
    identificationNumber: string,
    identificationType: string = "National ID"
  ): Promise<{ sessionId: string; maskedPhone: string }> {
    return this.otpService.sendOtp(identificationNumber, identificationType);
  }

  async validateOtp(
    sessionId: string,
    otp: string,
    locationUuid: string
  ): Promise<{
    status: string;
    identificationNumber?: string;
    identificationType?: string;
  }> {
    return this.otpService.validateOtp(sessionId, otp, locationUuid);
  }
}
