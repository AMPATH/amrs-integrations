import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../hie-http-request/hie-http-requests';
import { OtpDischargeDto } from './types';

@Injectable()
export class OtpDischargeService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async getDischargeOtp(
    otpDischargeDto: OtpDischargeDto,
    locationUuid: string,
  ) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const otpDischargeUrl = `${baseUrl}/api/v1/claims/otp/discharge`;

    try {
      const response = await this.hieHttpRequests.sendPostRequest(
        otpDischargeUrl,
        otpDischargeDto,
        locationUuid,
      );
      const data = await response.json();
      return data ?? [];
    } catch (error) {
      console.error(error);
      throw new HttpException(
        'Error requesting Discharge OTP',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
