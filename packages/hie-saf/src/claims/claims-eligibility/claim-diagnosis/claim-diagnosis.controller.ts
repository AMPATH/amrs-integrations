import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { ClaimDiagnosisService } from './claim-diagnosis.service';
import { AddClaimDiagnosisRequestDto } from './dto/add-claim-diagnosis-request.dto';
import { AddClaimDiagnosisDto } from './types';

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
}
