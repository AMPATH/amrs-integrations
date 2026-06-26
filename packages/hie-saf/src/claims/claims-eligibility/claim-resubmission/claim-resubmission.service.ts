import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import { ResubmitClaimDto } from './types';

@Injectable()
export class ClaimResubmissionService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async resubmitClaim(
    resubmitClaimDto: ResubmitClaimDto,
    locationUuid: string,
  ): Promise<any> {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const addClaimLineUrl = `${baseUrl}/api/v1/claims/resubmit`;
    try {
      const response = await this.hieHttpRequests.sendPostRequest(
        addClaimLineUrl,
        resubmitClaimDto,
        locationUuid,
      );
      const data = await response.json();
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error Resubmitting claim',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
