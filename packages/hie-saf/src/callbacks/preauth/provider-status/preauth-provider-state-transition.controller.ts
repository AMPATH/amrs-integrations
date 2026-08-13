import { Body, Controller, Post } from '@nestjs/common';
import { PreauthProviderStateTransitionDto } from './dto/preauth-provider-state-transition.dto';
import { PreauthProviderStateTransitionService } from './preauth-provider-state-transition.service';

@Controller('callback/provider')
export class PreauthProviderStateTransitionController {
  constructor(
    private readonly preauthProviderStateTransitionService: PreauthProviderStateTransitionService,
  ) {}

  @Post('preauth')
  createPreauthProviderStateTransition(
    @Body()
    preauthProviderStateTransitionDto: PreauthProviderStateTransitionDto,
  ) {
    return this.preauthProviderStateTransitionService.createPreauthProviderStateTransition(
      preauthProviderStateTransitionDto,
    );
  }
}
