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
  public addClaimLine(@Body() body: AddClaimDiagnosisRequestDto) {
    const addClaimLineDto: AddClaimDiagnosisDto = {
      consent_token: body.consentToken,
      intervention_code: body.interventionCode,
      icd_code: body.icdCode,
    };
    return this.claimDiagnosisService.addClaimDiagnosis(
      addClaimLineDto,
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
    return this.claimDiagnosisService.addClaimDiagnosis(
      removeClaimLineDto,
      body.locationUuid,
    );
  }
}
