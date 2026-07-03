import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import { CloseClaimDto } from './types/index';

@Injectable()
export class ClaimClosureService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async closeClaim(
    closeClaimDto: CloseClaimDto,
    locationUuid: string,
  ): Promise<any> {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const closeClaimUrl = `${baseUrl}/api/v1/claims/close`;
    try {
      const response = await this.hieHttpRequests.sendPostRequest(
        closeClaimUrl,
        closeClaimDto,
        locationUuid,
      );
      const data = await response.json();
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error closing claim',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
