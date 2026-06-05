import { Body, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PatientSubBenefitsDto } from './dto/fetch-sub-benefits.dto';
import { SubBenefitsService } from './sub-benefits.service';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';

@UseGuards(OpenMrsAuthGuard)
@Controller('sub-benefits')
export class SubBenefitsController {
  constructor(private readonly subBenefitsService: SubBenefitsService) {}
  @Get()
  fetchPatientSubBenefits(@Query() query: PatientSubBenefitsDto) {
    return this.subBenefitsService.fetchPatientSubBenefits(query);
  }
}
