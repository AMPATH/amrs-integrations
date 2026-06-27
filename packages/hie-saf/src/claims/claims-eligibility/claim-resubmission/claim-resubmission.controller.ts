import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { ClaimResubmissionService } from './claim-resubmission.service';
import { ResubmitClaimRequestDto } from './dto/resubmit-claim-request.dto';
import { ResubmitClaimDto } from './types';

@UseGuards(OpenMrsAuthGuard)
@Controller('claim-resubmission')
export class ClaimResubmissionController {
  constructor(
    private readonly claimResubmissionService: ClaimResubmissionService,
  ) {}

  @Post()
  public resubmitClaim(@Body() body: ResubmitClaimRequestDto) {
    const resubmitClaimDto: ResubmitClaimDto = {
      consent_token: body.consentToken,
    };
    return this.claimResubmissionService.resubmitClaim(
      resubmitClaimDto,
      body.locationUuid,
    );
  }
}
