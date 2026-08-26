import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import { InjectRepository } from '@nestjs/typeorm';
import { ClaimLine } from '../../../core/database/entities/claime-line.entity';
import { Repository } from 'typeorm';
import { ClaimVisit } from '../../../core/database/entities/claim-visit.entity';
import {
  SubmitUnIdentifiedClaimDto,
  type CreateEmergencyIdentifiedClaimDto,
  type CreateEmergencyUnidentifiedClaimDto,
} from './types';
import { SHA_EMERGENCY_INTERVENTIONS } from './constants';

@Injectable()
export class EmergencyClaimService {
  constructor(
    @InjectRepository(ClaimLine)
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
    @InjectRepository(ClaimVisit)
    private claimVisitRepository: Repository<ClaimVisit>,
  ) {}
  async createEmergencyUnidentifiedClaim(
    createEmergencyUnidentifiedClaimDto: CreateEmergencyUnidentifiedClaimDto,
    locationUuid: string,
  ): Promise<any> {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const createEmergencyUnidentifiedClaimUrl = `${baseUrl}/api/v1/claims/emergency`;
    try {
      const response = await this.hieHttpRequests.sendPostRequest(
        createEmergencyUnidentifiedClaimUrl,
        createEmergencyUnidentifiedClaimDto,
        locationUuid,
      );
      const data = await response.json();
      if ('error' in data) {
        Logger.error(data);
        return data;
      }
      if (data) {
        try {
          const claimVisitEntity = this.claimVisitRepository.create({
            locationUuid: locationUuid,
            patientId: '',
            serviceType: '',
            claimVisitId: data.id,
            claimVisitNumber: data.visit_number,
            visitStart: data.visit_start,
            authorizationCode: data.authorization_code,
            authorizationGuid: data.authorization_guid,
            visitResponse: data,
            providerStatus: data.workflow_state,
            providerAuthStatus: data.claim_auth_status,
            totalClaimAmount: data.total_claim_amount,
            totalClaimDiscount: data.total_claim_discount,
            totalClaimCoPay: data.total_claim_copay,
            totalClaimNetAmount: data.total_claim_net_amount,
          });
          await this.claimVisitRepository.save(claimVisitEntity);
        } catch (error) {
          Logger.error(error);
        }
      }
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error creating emergency unidentified claim',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async createEmergencyIdentifiedClaim(
    createEmergencyIdentifiedClaimDto: CreateEmergencyIdentifiedClaimDto,
    locationUuid: string,
  ): Promise<any> {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const createEmergencyUnidentifiedClaimUrl = `${baseUrl}/api/v1/claims/emergency`;
    try {
      const response = await this.hieHttpRequests.sendPostRequest(
        createEmergencyUnidentifiedClaimUrl,
        createEmergencyIdentifiedClaimDto,
        locationUuid,
      );
      const data = await response.json();
      if ('error' in data) {
        Logger.error(data);
        return data;
      }
      if (data) {
        try {
          const claimVisitEntity = this.claimVisitRepository.create({
            locationUuid: locationUuid,
            patientId: '',
            serviceType: '',
            claimVisitId: data.id,
            claimVisitNumber: data.visit_number,
            visitStart: data.visit_start,
            authorizationCode: data.authorization_code,
            authorizationGuid: data.authorization_guid,
            visitResponse: data,
            providerStatus: data.workflow_state,
            providerAuthStatus: data.claim_auth_status,
            totalClaimAmount: data.total_claim_amount,
            totalClaimDiscount: data.total_claim_discount,
            totalClaimCoPay: data.total_claim_copay,
            totalClaimNetAmount: data.total_claim_net_amount,
          });
          await this.claimVisitRepository.save(claimVisitEntity);
        } catch (error) {
          Logger.error(error);
        }
      }
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error creating emergency identified claim',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async submitEmergencyUnIdentifiedClaim(
    submitUnIdentifiedClaimDto: SubmitUnIdentifiedClaimDto,
    locationUuid: string,
  ): Promise<any> {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const submitEmergencyUnidentifiedClaimUrl = `${baseUrl}/api/v1/claims/submit`;
    try {
      const response = await this.hieHttpRequests.sendPostRequest(
        submitEmergencyUnidentifiedClaimUrl,
        submitUnIdentifiedClaimDto,
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
        'Error submitting emergency unidentified claim',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  getSHAEmergencyInterventions() {
    return {
      count: 11,
      pageSize: 10000,
      currentPage: 1,
      totalPages: 1,
      startIndex: 1,
      endIndex: 11,
      results: SHA_EMERGENCY_INTERVENTIONS,
    };
  }
}
