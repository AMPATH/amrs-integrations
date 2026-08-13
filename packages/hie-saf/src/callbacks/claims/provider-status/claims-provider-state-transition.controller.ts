import { Body, Controller, Post } from '@nestjs/common';
import { ClaimProviderStateTransitionDto } from './dto/claims-provider-state-transition.dto';
import { ClaimsProviderStateTransitionService } from './claims-provider-state-transition.service';

@Controller('callback/provider')
export class ClaimsProviderStatusController {
  constructor(
    private claimsProviderStateTransitionService: ClaimsProviderStateTransitionService,
  ) {}

  @Post('claim')
  createClaimProviderPreview(
    @Body() claimProviderStateTransitionDto: ClaimProviderStateTransitionDto,
  ) {
    return this.claimsProviderStateTransitionService.createClaimProviderPreview(
      claimProviderStateTransitionDto,
    );
  }
}
