import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InterventionsService } from './interventions.service';
import { InterventionsDto } from './dto/interventions.dto';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';

@UseGuards(OpenMrsAuthGuard)
@Controller('interventions')
export class InterventionsController {
  constructor(private readonly interventionsService: InterventionsService) {}
  @Get()
  fetchPatientSubBenefits(@Query() query: InterventionsDto) {
    return this.interventionsService.fetchInterventions(query);
  }
}
