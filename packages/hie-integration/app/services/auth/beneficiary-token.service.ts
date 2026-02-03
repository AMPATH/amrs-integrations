import { HieHttpClient } from "../../utils/http-client";
import config from "../../config/env";
import { BeneficiaryTokenResponse } from "../../types/hie.type";
import { logger } from "../../utils/logger";

export class BeneficiaryTokenService {
  private httpClient: HieHttpClient;
  private beneficiaryTokenUrl = `${config.HIE.BASE_URL}/v1/eligibility/generate-beneficiary-token`;
  constructor(locationUuid: string) {
    this.httpClient = new HieHttpClient(config.HIE.BASE_URL, locationUuid, {});
  }

  public async getBeneficiaryToken(): Promise<BeneficiaryTokenResponse> {
    try {
      const response = await this.httpClient.post<BeneficiaryTokenResponse>(
        this.beneficiaryTokenUrl,
      );
      const data = response.data;
      const { accessToken, refreshToken } = data;
      return {
        accessToken,
        refreshToken,
      };
    } catch (error) {
      logger.error(`An error occured while fetching beneficiary token`, error);
      throw new Error();
    }
  }
}
