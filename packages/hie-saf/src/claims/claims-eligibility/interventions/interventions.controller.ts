import { Controller, Get, Query } from '@nestjs/common';
import { InterventionsService } from './interventions.service';
import { InterventionsDto } from './dto/interventions.dto';

@Controller('interventions')
export class InterventionsController {
  constructor(private readonly interventionsService: InterventionsService) {}
  @Get()
  fetchPatientSubBenefits(@Query() query: InterventionsDto) {
    return this.interventionsService.fetchInterventions(query);
  }
}
