import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { InterventionsService } from './interventions.service';
import { InterventionsDto } from './dto/interventions.dto';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { AddInterventionsRequestDto } from './dto/add-interventions.dto';
import { AddIntervationDto, SwitchInterventionsDto } from './types';
import { SwitchInterventionsRequestDto } from './dto/switch-interventions-request.dto';

@UseGuards(OpenMrsAuthGuard)
@Controller('interventions')
export class InterventionsController {
  constructor(private readonly interventionsService: InterventionsService) {}
  @Get()
  fetchPatientSubBenefits(@Query() query: InterventionsDto) {
    return this.interventionsService.fetchInterventions(query);
  }
  @Post()
  public addInterventions(@Body() body: AddInterventionsRequestDto) {
    const addInterventionDto: AddIntervationDto = {
      consent_token: body.consentToken,
      intervention_code: body.interventionCode,
    };
    return this.interventionsService.addInterventions(
      addInterventionDto,
      body.locationUuid,
    );
  }
  @Post('switch')
  public switchInterventions(@Body() body: SwitchInterventionsRequestDto) {
    const switchInterventionDto: SwitchInterventionsDto = {
      consent_token: body.consentToken,
      existing_intervention_code: body.existingInterventionCode,
      new_intervention_code: body.newInterventionCode,
      retain_bill_items: body.retainBillItems,
    };
    if (body.retainBillItems) {
      switchInterventionDto['bill_from'] = body.billFrom;
      switchInterventionDto['bill_to'] = body.billTo;
    }
    return this.interventionsService.switchInterventions(
      switchInterventionDto,
      body.locationUuid,
    );
  }
}
