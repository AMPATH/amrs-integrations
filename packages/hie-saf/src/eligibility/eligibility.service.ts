import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MemberEligibilityResponse } from './types';
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
}
