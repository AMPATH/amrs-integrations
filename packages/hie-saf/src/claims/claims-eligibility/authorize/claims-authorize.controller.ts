import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { ClaimsAuthorizeService } from './claims-authorize.service';
import { CreateOtpAuthorizationDto } from './dto/create-otp-authorization.dto';

@UseGuards(OpenMrsAuthGuard)
@Controller('claims-authorize')
export class ClaimsAuthorizeController {
  constructor(private readonly claimsAuthorizeService: ClaimsAuthorizeService) {}

  /** OTP pre-visit authorize for elective preauth. Biometrics remains at POST /client/biometrics-authorize. */
  @Post()
  authorizeWithOtp(@Body() body: CreateOtpAuthorizationDto) {
    return this.claimsAuthorizeService.authorizeWithOtp(body);
  }
}
