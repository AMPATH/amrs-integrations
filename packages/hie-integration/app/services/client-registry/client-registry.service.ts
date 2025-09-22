import axios from "axios";
import config from "../../config/env";
import { EncryptedClientResp } from "../../types/hie.type";
import { logger } from "../../utils/logger";
import { HieHttpClient } from "../../utils/http-client";
import { decryptData } from "../../utils/descrypt-data";
import { OtpService } from "./otp.service";

export class ClientRegistryService {
  private httpClient = new HieHttpClient(config.HIE.BASE_URL);
  private otpService = new OtpService();

  async fetchPatientFromHie(
    identificationNumber: string,
    idType: string = "National ID"
  ): Promise<any> {
    try {
      const response = await this.httpClient.get<EncryptedClientResp>(
        config.HIE.CLIENT_REGISTRY_URL,
        {
          identification_type: idType,
          identification_number: identificationNumber,
          agent: config.HIE.AGENT,
        }
      );

      if (!response.data || response.data.message.total === 0) {
        throw new Error("Patient not found in HIE registry");
      }

      if (response.data.message.result) {
        const patientData = response.data.message.result.map((d) => {
          return decryptData(d._pii);
        });
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
    otp: string
  ): Promise<{
    status: string;
    identificationNumber?: string;
    identificationType?: string;
  }> {
    return this.otpService.validateOtp(sessionId, otp);
  }
}
