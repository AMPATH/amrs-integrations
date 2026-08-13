import { Body, Controller, Post } from '@nestjs/common';
import { ClaimsPayerStatusService } from './clams-payer-transition-status.service';
import { ClaimPayerStateTransitionDto } from './dto/claims-payer-transition-status.dto';

@Controller('callback/payer')
export class ClaimsPayerStatusController {
  constructor(
    private readonly claimsPayerTransitionStateService: ClaimsPayerStatusService,
  ) {}

  @Post('claim')
  postClaimPayerPreview(
    @Body() claimPayerStateTransitionDto: ClaimPayerStateTransitionDto,
  ) {
    return this.claimsPayerTransitionStateService.createClaimPayerPreview(
      claimPayerStateTransitionDto,
    );
  }
}
