import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { CreateEmergencyUnidentifiedClaimRequestDto } from './dto/create-emergency-unidentified-claim-request.dto';
import { EmergencyClaimService } from './emergency-claim.service';
import { CreateEmergencyUnidentifiedClaimDto } from './types';

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
}
