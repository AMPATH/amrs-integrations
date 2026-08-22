import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { CreateEmergencyUnidentifiedClaimRequestDto } from './dto/create-emergency-unidentified-claim-request.dto';
import { EmergencyClaimService } from './emergency-claim.service';
import {
  SubmitUnIdentifiedClaimDto,
  type CreateEmergencyIdentifiedClaimDto,
  type CreateEmergencyUnidentifiedClaimDto,
} from './types';
import { CreateEmergencyIdentifiedClaimRequestDto } from './dto/create-emergency-identified-claim-request.dto';
import { SubmitUnIdentifiedClaimRequestDto } from './dto/submit-unidentified-claim-request.dto';

@UseGuards(OpenMrsAuthGuard)
@Controller('emergency')
export class EmergencyClaimController {
  constructor(private readonly emergencyClaimService: EmergencyClaimService) {}

  @Post('claim/unidentified')
  public createEmergencyUnidentifiedClaim(
    @Body() body: CreateEmergencyUnidentifiedClaimRequestDto,
  ) {
    const payload: CreateEmergencyUnidentifiedClaimDto = {
      interventions: body.interventionCodes,
      mode_of_arrival: body.modeOfArrival,
      brought_by: body.broughtBy,
      reference_number: body.referenceNumber,
      identification_number: body.identificationNumber,
      identification_type: body.identificationType,
      regulation_body: body.regulationBody,
    };
    if (body.notes) {
      payload['notes'] = body.notes;
    }
    return this.emergencyClaimService.createEmergencyUnidentifiedClaim(
      payload,
      body.locationUuid,
    );
  }
  @Post('claim/identified')
  public createEmergencyIdentifiedClaim(
    @Body() body: CreateEmergencyIdentifiedClaimRequestDto,
  ) {
    const payload: CreateEmergencyIdentifiedClaimDto = {
      interventions: body.interventionCodes,
      mode_of_arrival: body.modeOfArrival,
      brought_by: body.broughtBy,
      reference_number: body.referenceNumber,
      identification_number: body.identificationNumber,
      identification_type: body.identificationType,
      regulation_body: body.regulationBody,
      beneficiary_cr_id: body.beneficiaryCrId,
    };
    if (body.notes) {
      payload['notes'] = body.notes;
    }
    return this.emergencyClaimService.createEmergencyUnidentifiedClaim(
      payload,
      body.locationUuid,
    );
  }
  @Post('claim/unidentified/submit')
  public submitUnIdentifiedClaim(
    @Body() body: SubmitUnIdentifiedClaimRequestDto,
  ) {
    const payload: SubmitUnIdentifiedClaimDto = {
      consent_token: body.consentToken,
      invoice_number: body.invoiceNumber,
      reason_for_unknown_patient: body.reasonForUnknownPatient,
    };
    return this.emergencyClaimService.submitEmergencyUnIdentifiedClaim(
      payload,
      body.locationUuid,
    );
  }
}
