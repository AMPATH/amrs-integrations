import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import { AddClaimLineDto, RemoveClaimLineDto } from './types';

@Injectable()
export class ClaimLineService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async addClaimLine(
    addClaimLineDto: Partial<AddClaimLineDto>,
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
      console.log({ addClaimLineDto });
      const data = await response.json();
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error Adding claim line',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async removeClaimLine(
    removeClaimLineDto: RemoveClaimLineDto,
    locationUuid: string,
  ): Promise<any> {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const removeClaimLineUrl = `${baseUrl}/api/v1/claims/lines`;
    try {
      const response = await this.hieHttpRequests.sendPatchRequest(
        removeClaimLineUrl,
        removeClaimLineDto,
        locationUuid,
      );
      const data = await response.json();
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error Removing claim line',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
