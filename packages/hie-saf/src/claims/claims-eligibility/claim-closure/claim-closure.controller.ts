import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { CloseClaimRequestDto } from './dto/close-claim-request.dto';
import { ClaimClosureService } from './claim-closure.service';
import { CloseClaimDto } from './types';

@UseGuards(OpenMrsAuthGuard)
@Controller('claim-closure')
export class ClaimClosureController {
  constructor(private readonly claimClosureService: ClaimClosureService) {}

  @Post()
  public submitClaim(@Body() body: CloseClaimRequestDto) {
    const closeClaimDto: CloseClaimDto = {
      consent_token: body.consentToken,
      cancel_reason_text: body.cancelReasonText,
      cancel_reason_type: body.cancelReasonType,
    };
    return this.claimClosureService.closeClaim(
      closeClaimDto,
      body.locationUuid,
    );
  }
}
