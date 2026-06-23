import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import { ClaimsVisitReponse, ClaimVisitDto } from './types';
import { CreateClaimVisitDto } from './dto/create-claim-visit.dto';

@Injectable()
export class ClaimsVisitService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async createClaimsVisit(createClaimVisitDto: CreateClaimVisitDto) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const clientSearchUrl = `${baseUrl}/api/v1/claims/visit`;
    try {
      const claimsVisitPayload: ClaimVisitDto = {
        intervention_codes: createClaimVisitDto.intervention_codes,
        otp: createClaimVisitDto.otp,
        patient_id: createClaimVisitDto.patient_id,
        service_type: createClaimVisitDto.service_type,
      };
      const response = await this.hieHttpRequests.sendPostRequest(
        clientSearchUrl,
        claimsVisitPayload,
        createClaimVisitDto.locationUuid,
      );
      const data = (await response.json()) as ClaimsVisitReponse;
      return data;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error Creating Claim Visit',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
