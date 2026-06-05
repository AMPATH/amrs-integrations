import { Body, Controller, Get, Query } from '@nestjs/common';
import { PatientSubBenefitsDto } from './dto/fetch-sub-benefits.dto';
import { SubBenefitsService } from './sub-benefits.service';

@Controller('sub-benefits')
export class SubBenefitsController {
  constructor(private readonly subBenefitsService: SubBenefitsService) {}
  @Get()
  fetchPatientSubBenefits(@Query() query: PatientSubBenefitsDto) {
    return this.subBenefitsService.fetchPatientSubBenefits(query);
  }
}
