import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { InterventionsService } from './interventions.service';
import { InterventionsDto } from './dto/interventions.dto';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { AddInterventionsRequestDto } from './dto/add-interventions.dto';
import {
  AddInterventionDto,
  RestoreInterventionDto,
  RetireInterventionDto,
  SwitchInterventionsDto,
} from './types';
import { SwitchInterventionsRequestDto } from './dto/switch-interventions-request.dto';
import { RestoreInterventionsRequestDto } from './dto/restore-intervention-request.dto';
import { RetireInterventionsRequestDto } from './dto/retire-intervention.dto';
import { CheckInterventionExistsRequestDto } from './dto/check-intervention-exists.dto';

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
    const addInterventionDto: AddInterventionDto = {
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
  @Post('restore')
  public restoreIntervention(@Body() body: RestoreInterventionsRequestDto) {
    const restoreInterventionDto: RestoreInterventionDto = {
      consent_token: body.consentToken,
      intervention_code: body.interventionCode,
    };
    return this.interventionsService.restoreInterventions(
      restoreInterventionDto,
      body.locationUuid,
    );
  }
  @Post('retire')
  public retireIntervention(@Body() body: RetireInterventionsRequestDto) {
    const retireInterventionDto: RetireInterventionDto = {
      consent_token: body.consentToken,
      intervention_code: body.interventionCode,
    };
    return this.interventionsService.retireInterventions(
      retireInterventionDto,
      body.locationUuid,
    );
  }
  @Get('check-intervention-exists')
  checkInterventionExists(@Query() query: CheckInterventionExistsRequestDto) {
    return this.interventionsService.checkInterventionExists(query);
  }
}
