import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { ClaimDiagnosisService } from './claim-diagnosis.service';
import { AddClaimDiagnosisRequestDto } from './dto/add-claim-diagnosis-request.dto';
import { AddClaimDiagnosisDto, RemoveClaimDiagnosisDto } from './types';
import { RemoveClaimDiagnosisRequestDto } from './dto/remove-claim-diagnosis-request.dto';

@UseGuards(OpenMrsAuthGuard)
@Controller('claim-diagnosis')
export class ClaimDiagnosisController {
  constructor(private readonly claimDiagnosisService: ClaimDiagnosisService) {}

  @Post()
  public addClaimDiagnosis(@Body() body: AddClaimDiagnosisRequestDto) {
    const addClaimDiagnosisDto: AddClaimDiagnosisDto = {
      consent_token: body.consentToken,
      intervention_code: body.interventionCode,
      icd_code: body.icdCode,
      practitioner_identification_number: body.practitionerIdentificationNumber,
      practitioner_identification_type: body.practitionerIdentificationType,
      practitioner_regulation_body: body.practitionerRegulationBody,
    };
    return this.claimDiagnosisService.addClaimDiagnosis(
      addClaimDiagnosisDto,
      body.locationUuid,
    );
  }
  @Delete()
  public removeClaimDiagnosis(@Body() body: RemoveClaimDiagnosisRequestDto) {
    const removeClaimLineDto: RemoveClaimDiagnosisDto = {
      consent_token: body.consentToken,
      icd_code: body.icdCode,
      intervention_code: body.interventionCode,
    };
    return this.claimDiagnosisService.removeClaimDiagnosis(
      removeClaimLineDto,
      body.locationUuid,
    );
  }
}
