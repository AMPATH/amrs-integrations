import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PomsfBalanceDto } from './dto/pomsf-balance.dto';
import { PomsfBalanceService } from './pomsf-balance.service';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';

@UseGuards(OpenMrsAuthGuard)
@Controller('pomsf-balance')
export class PomsfBalanceController {
  constructor(
    private readonly pomsfBalanceService: PomsfBalanceService,
  ) {}
  @Get()
  fetchPomsfBalance(@Query() query: PomsfBalanceDto) {
    return this.pomsfBalanceService.fetchPomsfBalance(query);
  }
}
