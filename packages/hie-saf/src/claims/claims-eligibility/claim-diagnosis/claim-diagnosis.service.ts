import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import { AddClaimDiagnosisDto, RemoveClaimDiagnosisDto } from './types';

@Injectable()
export class ClaimDiagnosisService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async addClaimDiagnosis(
    addClaimDiagnosisDto: AddClaimDiagnosisDto,
    locationUuid: string,
  ): Promise<any> {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const addClaimDiagnosisUrl = `${baseUrl}/api/v1/claims/diagnoses`;
    try {
      const response = await this.hieHttpRequests.sendPostRequest(
        addClaimDiagnosisUrl,
        addClaimDiagnosisDto,
        locationUuid,
      );
      const data = await response.json();
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error Adding claim Diagnosis',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async removeClaimLine(
    removeClaimDiagnosisDto: RemoveClaimDiagnosisDto,
    locationUuid: string,
  ): Promise<any> {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const removeClaimDiagnosisUrl = `${baseUrl}/api/v1/claims/diagnoses`;
    try {
      const response = await this.hieHttpRequests.sendPatchRequest(
        removeClaimDiagnosisUrl,
        removeClaimDiagnosisDto,
        locationUuid,
      );
      const data = await response.json();
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error Removing claim Diagnosis',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
