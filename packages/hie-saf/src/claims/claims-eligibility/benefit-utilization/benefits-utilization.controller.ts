import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { BenefitsUtilizationDto } from './dto/benefits-utilization.dto';
import { BenefitsUtilizationService } from './benefits-utilization.service';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';

@UseGuards(OpenMrsAuthGuard)
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
