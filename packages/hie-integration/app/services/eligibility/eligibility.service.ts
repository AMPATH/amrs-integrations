import {
  EligibilityDto,
  EligibilityFilterDto,
  EligibilityResponse,
} from "../../types/hie.type";
import { HieHttpClient } from "../../utils/http-client";
import { BeneficiaryTokenService } from "../auth/beneficiary-token.service";
import config from "../../config/env";
import { logger } from "../../utils/logger";

export class EligibilityService {
  private beneficiaryService: BeneficiaryTokenService;
  private eligibilityCheckUrl = `${config.HIE.BASE_URL}/backend/api/v5/coverage/validate`;
  private httpClient!: HieHttpClient;
  constructor(locationUuid: string) {
    this.beneficiaryService = new BeneficiaryTokenService(locationUuid);
  }
  async getClientEligibility(eligibilityfilter: EligibilityFilterDto) {
    const beneficiaryToken = await this.beneficiaryService.getBeneficiaryToken();
    const extraHeaders = {
      "x-bms-token": beneficiaryToken.accessToken,
    };
    this.httpClient = new HieHttpClient(
      config.HIE.BASE_URL,
      eligibilityfilter.locationUuid,
      extraHeaders,
    );

    try {
      const payload = this.generateEligibilityPayload(eligibilityfilter);
      if (!this.isValidateEligilityPayload(payload)) {
        throw new Error("Invalid eligibility payload");
      }
      const response = await this.httpClient.post<EligibilityResponse>(
        this.eligibilityCheckUrl,
        payload,
      );
      return response.data;
    } catch (error) {
      logger.error(`An error occured while fetching client eligibility`, error);
      throw new Error("An error occured while fetching client eligibility");
    }
  }
  private generateEligibilityPayload(
    eligibilityfilter: EligibilityFilterDto,
  ): EligibilityDto {
    const params: EligibilityDto = {
      requestIdNumber: eligibilityfilter.requestIdNumber,
      requestIdType: eligibilityfilter.requestIdType,
    };
    return params;
  }
  private isValidateEligilityPayload(
    eligibilityPayload: EligibilityDto,
  ): boolean {
    if (!eligibilityPayload.requestIdNumber) {
      logger.error("Missing requestIdNumber");
      return false;
    }
    if (!eligibilityPayload.requestIdType) {
      logger.error("Missing requestIdType");
      return false;
    }

    return true;
  }
}
