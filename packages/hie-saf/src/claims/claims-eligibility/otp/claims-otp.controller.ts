import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { ClaimsOtpService } from './claims-otp.service';
import { RequestClaimOtpDto } from './dto/request-claims-otp.dto';

@UseGuards(OpenMrsAuthGuard)
@Controller('claims-otp')
export class ClaimsOtpController {
  constructor(private readonly claimsOtpService: ClaimsOtpService) {}
  @Post()
  createClaimsVisit(@Body() body: RequestClaimOtpDto) {
    return this.claimsOtpService.fetchOtp(body);
  }
}
