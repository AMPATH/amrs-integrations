import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { ClaimsOtpService } from './claims-otp.service';
import { RequestClaimOtpDto } from './dto/request-claims-otp.dto';
import { OtpDischargeRequestDto } from '../../../consent/otp-discharge/dto/otp-discharge-request.dto';
import { OtpDischargeService } from '../../../consent/otp-discharge/otp-discharge.service';
import { OtpDischargeDto } from '../../../consent/otp-discharge/types';

@UseGuards(OpenMrsAuthGuard)
@Controller('claims-otp')
export class ClaimsOtpController {
  constructor(
    private readonly claimsOtpService: ClaimsOtpService,
    private otpDischargeService: OtpDischargeService,
  ) {}
  @Post()
  createClaimsVisit(@Body() body: RequestClaimOtpDto) {
    return this.claimsOtpService.fetchOtp(body);
  }
  @Post('discharge')
  getDischargeOtp(@Body() body: OtpDischargeRequestDto) {
    const dischargeOtpDto: OtpDischargeDto = {
      consent_token: body.consentToken,
      patient_id: body.patientId,
    };
    return this.otpDischargeService.getDischargeOtp(
      dischargeOtpDto,
      body.locationUuid,
    );
  }
}
