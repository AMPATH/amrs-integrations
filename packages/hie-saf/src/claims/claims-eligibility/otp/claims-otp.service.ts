import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import { RequestClaimOtpDto } from './dto/request-claims-otp.dto';
import { ClaimsOtpDto } from './dto/claims-otp.dto';
import { ClaimsOtpReponse } from './types';

@Injectable()
export class ClaimsOtpService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async fetchOtp(requestClaimOtpDto: RequestClaimOtpDto) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const claimsOtpUrl = `${baseUrl}/api/v1/claims/otp`;
    try {
      const claimsOtpDtoPayload: ClaimsOtpDto = {
        intervention_codes: requestClaimOtpDto.intervention_codes,
        patient_id: requestClaimOtpDto.patient_id,
        beneficiary_contact_id:
          requestClaimOtpDto?.beneficiary_contact_id ?? '',
      };
      const response = await this.hieHttpRequests.sendPostRequest(
        claimsOtpUrl,
        claimsOtpDtoPayload,
        requestClaimOtpDto.locationUuid,
      );
      const data = (await response.json()) as ClaimsOtpReponse;
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
