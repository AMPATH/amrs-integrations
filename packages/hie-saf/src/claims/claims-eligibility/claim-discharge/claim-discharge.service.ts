import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import { type ClaimDischargeDto } from './types';

@Injectable()
export class ClaimDischargeService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async dichargeClaim(
    claimDischargeDto: ClaimDischargeDto,
    locationUuid: string,
  ) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const claimDischargeUrl = `${baseUrl}/api/v1/claims/discharge`;
    try {
      const response = await this.hieHttpRequests.sendPostRequest(
        claimDischargeUrl,
        claimDischargeDto,
        locationUuid,
      );
      const data = await response.json();
      if ('error' in data) {
        Logger.error(data);
        return data;
      }
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error Discharging Claim',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
