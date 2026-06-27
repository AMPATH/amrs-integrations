import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import { SubmitClaimDto } from './types';

@Injectable()
export class ClaimSubmissionService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async submitClaim(
    submitClaimDto: SubmitClaimDto,
    locationUuid: string,
  ): Promise<any> {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const submitClaimUrl = `${baseUrl}/api/v1/claims/submit`;
    try {
      const response = await this.hieHttpRequests.sendPostRequest(
        submitClaimUrl,
        submitClaimDto,
        locationUuid,
      );
      const data = await response.json();
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error Submitting claim',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
