import { HieHttpClient } from "../../utils/http-client";
import config from "../../config/env";
import { logger } from "../../utils/logger";
import { cache } from "../../utils/cache.util";
import { decryptData } from "../../utils/decrypt-data";
import { HieMappingService } from "../amrs/hie-mapping-service";

interface OtpSession {
  otpRecord: string;
  identificationNumber: string;
  identificationType: string;
  createdAt: Date;
}

export class OtpService {
  private httpClient: HieHttpClient;
  private readonly SESSION_TIMEOUT_SECONDS = 15 * 60; // 15 minutes
  private hieMappingService: HieMappingService;

  constructor(facilityUuid: string) {
    this.httpClient = new HieHttpClient(config.HIE.BASE_URL, facilityUuid);
    this.hieMappingService = new HieMappingService();
  }

  async sendOtp(
    identificationNumber: string,
    identificationType: string
  ): Promise<{ sessionId: string; maskedPhone: string }> {
    try {
      const response = await this.httpClient.post<{
        message: { otp_record: string; phone: string };
      }>("/send-custom-otp", {
        identification_number: identificationNumber,
        identification_type: identificationType,
      });

      const { otp_record, phone } = response.data.message;
      const sessionId = this.generateSessionId();

      const session: OtpSession = {
        otpRecord: otp_record,
        identificationNumber,
        identificationType,
        createdAt: new Date(),
      };

      // store in NodeCache
      cache.set(sessionId, session, this.SESSION_TIMEOUT_SECONDS);

      logger.info(`OTP session created: ${sessionId}`);

      return {
        sessionId,
        maskedPhone: phone,
      };
    } catch (error: any) {
      logger.error(`OTP send failed: ${error.message}`);
      throw new Error(
        `OTP sending failed: ${error.response?.data.message || error.message}`
      );
    }
  }

  async validateOtp(
    sessionId: string,
    otp: string,
    locationUuid: string
  ): Promise<{
    status: "valid" | "invalid";
    identificationNumber?: string;
    identificationType?: string;
  }> {
    logger.info(`Validating OTP for session: ${sessionId}`);

    const session = cache.get<OtpSession>(sessionId);

    if (!session) {
      throw new Error("Invalid or expired session");
    }

    try {
      const agent = this.hieMappingService.getAgentUsingLocationUuid(
        locationUuid
      );
      if (!agent) {
        logger.error(`Agent for location ${locationUuid} not found!`);
        throw new Error(`Agent for location ${locationUuid} not found!`);
      }
      const response = await this.httpClient.post<{
        message: string;
      }>("/validate-custom-otp", {
        agent: agent,
        otp_record: session.otpRecord,
        otp,
      });
      const faciliyCode = await this.hieMappingService.getFacilityCodeUsingLocationUuid(
        locationUuid
      );
      if (!faciliyCode) {
        logger.error(`Facilty code for location ${locationUuid} not found`);
        throw new Error(`Facilty code for location ${locationUuid} not found`);
      }
      const decrypted = await decryptData(response.data.message, faciliyCode);

      const status = decrypted.status ?? "invalid";

      return {
        status,
        identificationType: session.identificationType,
        identificationNumber: session.identificationNumber,
      };
    } catch (error: any) {
      logger.error(`OTP validation failed: ${error.message}`);
      throw new Error(
        `OTP validation failed: ${
          error.response?.data.message || error.message
        }`
      );
    }
  }

  getSession(sessionId: string): OtpSession | undefined {
    return cache.get<OtpSession>(sessionId);
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
