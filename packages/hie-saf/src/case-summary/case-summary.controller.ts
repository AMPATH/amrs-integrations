import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { OpenMrsAuthGuard } from '../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { CaseSummaryService } from './case-summary.service';
import { FetchCaseSummaryDto } from './dto/fetch-case-summary.dto';

/**
 * Visit case summary: one assembled clinical document for printing and for
 * attachment to a SHA claim.
 */
@UseGuards(OpenMrsAuthGuard)
@Controller('case-summary')
export class CaseSummaryController {
  constructor(private readonly caseSummaryService: CaseSummaryService) {}

  @Get()
  getCaseSummary(@Query() query: FetchCaseSummaryDto) {
    return this.caseSummaryService.getVisitCaseSummary(query);
  }
}
