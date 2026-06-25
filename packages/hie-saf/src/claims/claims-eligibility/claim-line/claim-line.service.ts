import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import { AddClaimLineDto } from './types';

@Injectable()
export class ClaimLineService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async addClaimLine(
    addClaimLineDto: AddClaimLineDto,
    locationUuid: string,
  ): Promise<any> {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const addClaimLineUrl = `${baseUrl}/api/v1/claims/lines`;
    try {
      const response = await this.hieHttpRequests.sendPostRequest(
        addClaimLineUrl,
        addClaimLineDto,
        locationUuid,
      );
      const data = await response.json();
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error fetching interventions',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
