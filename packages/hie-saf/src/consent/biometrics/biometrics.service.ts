import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../hie-http-request/hie-http-requests';
import {
  type BiometricsAuthorizationDto,
  type BiometricsAuthorizationResponse,
} from './types';

@Injectable()
export class BiometricsService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async authorizeBiometrics(
    biometricsAuthorizationDto: BiometricsAuthorizationDto,
    locationUuid: string,
  ) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const biometricsAuthUrl = `${baseUrl}/api/v1/claims/authorize`;
    try {
      const response = await this.hieHttpRequests.sendPostRequest(
        biometricsAuthUrl,
        biometricsAuthorizationDto,
        locationUuid,
      );
      const data = (await response.json()) as BiometricsAuthorizationResponse;
      return data ?? [];
    } catch (error) {
      console.error(error);
      throw new HttpException(
        'Error Authorizing biometrics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
