import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ClaimsMemberEligibilityResponse,
  MemberEligibilityResponse,
} from './types';
import { ClientEligibilitySearchDto } from './dto/client-eligibility-search.dto';
import { HieHttpRequests } from 'src/hie-http-request/hie-http-requests';

@Injectable()
export class EligibilityService {
  constructor(
    private readonly configService: ConfigService,
    private readonly hieHttpRequests: HieHttpRequests,
  ) {}
  public async fetchClientEligibilityStatus(
    clientEligibilitySearchDto: ClientEligibilitySearchDto,
  ) {
    const baseUrl = this.configService.get<string>('HIE_BASE_URL') ?? '';
    const eligibilityUrl = `${baseUrl}/hie/api/v3/eligibility-check`;

    try {
      const resp = await this.hieHttpRequests.sendPostRequest(
        eligibilityUrl,
        clientEligibilitySearchDto,
        clientEligibilitySearchDto.locationUuid,
      );
      const data = (await resp.json()) as MemberEligibilityResponse;
      return data;
    } catch (error) {
      console.error(error);
      Logger.error(error);
      throw new HttpException(
        'Error getting Eligibility status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  public async fetchClientClaimsEligibility(
    clientEligibilitySearchDto: ClientEligibilitySearchDto,
  ) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const eligibilityUrl = `${baseUrl}/api/v1/patients/eligibility?identification_number=${clientEligibilitySearchDto.identificationNumber}&identification_type=${clientEligibilitySearchDto.identificationType}`;

    try {
      const resp = await this.hieHttpRequests.sendGetRequest(
        eligibilityUrl,
        clientEligibilitySearchDto.locationUuid,
      );
      const data = (await resp.json()) as ClaimsMemberEligibilityResponse;
      return data;
    } catch (error) {
      console.error(error);
      Logger.error(error);
      throw new HttpException(
        'Error getting Eligibility status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
