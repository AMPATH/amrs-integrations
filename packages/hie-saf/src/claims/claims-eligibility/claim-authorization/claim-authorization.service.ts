import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import {
  CancelPendingAuthorizationDto,
  ClaimAuthorizationsResponse,
} from './types';
import { ClaimAuthorizationsRequestDto } from './dto/claim-authorizations-request.dto';

@Injectable()
export class ClaimAuthorizationService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async getAuthorizations(
    claimAuthorizationsRequestDto: ClaimAuthorizationsRequestDto,
    locationUuid: string,
  ): Promise<any> {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    let authorizationsUrl = '';
    if (claimAuthorizationsRequestDto.beneficiaryCode) {
      authorizationsUrl = `${baseUrl}/api/v1/claims/authorizations?beneficiary_code=${claimAuthorizationsRequestDto.beneficiaryCode}`;
    }
    if (claimAuthorizationsRequestDto.consentToken) {
      authorizationsUrl = `${baseUrl}/api/v1/claims/authorizations?token=${claimAuthorizationsRequestDto.consentToken}`;
    }

    try {
      const response = await this.hieHttpRequests.sendGetRequest(
        authorizationsUrl,
        locationUuid,
      );
      const data = (await response.json()) as
        | ClaimAuthorizationsResponse[]
        | ClaimAuthorizationsResponse;
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error getting authorizations',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async cancelPendingAuthorizations(
    cancelPendingAuthorizationDto: CancelPendingAuthorizationDto,
    locationUuid: string,
  ): Promise<any> {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const cancelPendingAuthorizationsUrl = `${baseUrl}/api/v1/claims/authorizations/${encodeURIComponent(cancelPendingAuthorizationDto.consentToken)}/reject`;
    try {
      const response = await this.hieHttpRequests.sendPostRequest(
        cancelPendingAuthorizationsUrl,
        {},
        locationUuid,
      );
      const data = (await response.json()) as ClaimAuthorizationsResponse[];
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error cancelling pending authorizations',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
