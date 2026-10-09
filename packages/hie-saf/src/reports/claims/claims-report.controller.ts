import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { OpenMrsAuthGuard } from '../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { ClaimsSummaryDto } from './dto/claims-summary.dto';
import { ClaimsReportService } from './claims-report.service';

@UseGuards(OpenMrsAuthGuard)
@Controller('claims-report')
export class ClaimsReportController {
  constructor(private claimsReportService: ClaimsReportService) {}
  @Post('summary')
  public getClaimsSummaryReport(@Body() body: ClaimsSummaryDto) {
    return this.claimsReportService.generateClaimsSummaryReport(body);
  }
}
