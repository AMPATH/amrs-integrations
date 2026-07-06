import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import {
  AddClaimDiagnosisDto,
  DiagnosisActions,
  RemoveClaimDiagnosisDto,
} from './types';
import { InjectRepository } from '@nestjs/typeorm';
import { ClaimDiagnosis } from '../../../core/database/entities/claim-diagnosis.entity';
import { Repository } from 'typeorm';

@Injectable()
export class ClaimDiagnosisService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
    @InjectRepository(ClaimDiagnosis)
    private claimDiagnosisRepository: Repository<ClaimDiagnosis>,
  ) {}
  async addClaimDiagnosis(
    addClaimDiagnosisDto: AddClaimDiagnosisDto,
    locationUuid: string,
  ) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const addClaimDiagnosisUrl = `${baseUrl}/api/v1/claims/diagnoses`;
    try {
      const response = await this.hieHttpRequests.sendPostRequest(
        addClaimDiagnosisUrl,
        addClaimDiagnosisDto,
        locationUuid,
      );
      const data = await response.json();
      if ('error' in data) {
        Logger.error(data);
        return data;
      }
      if (data) {
        try {
          const addDiagnosisEntity = this.claimDiagnosisRepository.create({
            locationUuid: locationUuid,
            diagnosisAction: DiagnosisActions.Add,
            consentToken: addClaimDiagnosisDto.consent_token,
            icdCode: addClaimDiagnosisDto.icd_code,
            interventionCode: addClaimDiagnosisDto.intervention_code,
            diagnosisResponse: data,
            practitionerIdentificationNumber:
              addClaimDiagnosisDto.practitioner_identification_number,
            practitionerIdentificationType:
              addClaimDiagnosisDto.practitioner_identification_type,
            practitionerRegulationBody:
              addClaimDiagnosisDto.practitioner_regulation_body,
          });
          await this.claimDiagnosisRepository.save(addDiagnosisEntity);
        } catch (error) {
          Logger.error(error);
        }
      }
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error Adding claim Diagnosis',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async removeClaimDiagnosis(
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
      if ('error' in data) {
        Logger.error(data);
        return data;
      }
      if (data) {
        try {
          const removeDiagnosisEntity = this.claimDiagnosisRepository.create({
            locationUuid: locationUuid,
            diagnosisAction: DiagnosisActions.Remove,
            consentToken: removeClaimDiagnosisDto.consent_token,
            icdCode: removeClaimDiagnosisDto.icd_code,
            interventionCode: removeClaimDiagnosisDto.intervention_code,
            diagnosisResponse: data,
          });
          await this.claimDiagnosisRepository.save(removeDiagnosisEntity);
        } catch (error) {
          Logger.error(error);
        }
      }
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
