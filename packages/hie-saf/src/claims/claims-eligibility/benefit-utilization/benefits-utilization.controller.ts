import { Controller, Get, Query } from '@nestjs/common';
import { BenefitsUtilizationDto } from './dto/benefits-utilization.dto';
import { BenefitsUtilizationService } from './benefits-utilization.service';

@Controller('benefits-utilization')
export class BenefitsUtilizationController {
  constructor(
    private readonly benefitsUtilizationService: BenefitsUtilizationService,
  ) {}
  @Get()
  fetchPatientBenefitsUtilization(@Query() query: BenefitsUtilizationDto) {
    return this.benefitsUtilizationService.fetchBenefitsUtilization(query);
  }
}
