import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import {
  PayerClaimPreviewResponse,
  PreviewPayerClaimDto,
  PreviewProviderClaimDto,
  ProviderClaimPreviewResponse,
} from './types';

@Injectable()
export class ClaimPreviewService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async previewProviderClaim(
    previewProviderClaimDto: PreviewProviderClaimDto,
    locationUuid: string,
  ) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const previewProviderClaimUrl = `${baseUrl}/api/v1/claims/preview`;
    try {
      const response = await this.hieHttpRequests.sendPostRequest(
        previewProviderClaimUrl,
        previewProviderClaimDto,
        locationUuid,
      );
      const data = (await response.json()) as ProviderClaimPreviewResponse;
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error previewing provider claim',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async previewPayerClaim(
    previewPayerClaimDto: PreviewPayerClaimDto,
    locationUuid: string,
  ) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const queryString = new URLSearchParams(previewPayerClaimDto).toString();
    const previewPayerClaimUrl = `${baseUrl}/api/v1/claims/preview/payer?${queryString}`;
    try {
      const response = await this.hieHttpRequests.sendGetRequest(
        previewPayerClaimUrl,
        locationUuid,
      );
      const data = (await response.json()) as PayerClaimPreviewResponse;
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error previewing payer claim',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
