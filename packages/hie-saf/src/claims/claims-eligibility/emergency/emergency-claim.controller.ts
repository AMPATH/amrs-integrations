import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { CreateEmergencyUnidentifiedClaimRequestDto } from './dto/create-emergency-unidentified-claim-request.dto';
import { EmergencyClaimService } from './emergency-claim.service';
import {
  AddEmergencyClaimDoctorDto,
  AddEmergencyClaimProtocolsDto,
  GetEmergencyClaimProtocolsDto,
  IdentifyUknownEmergencyCaseDto,
  RemoveEmergencyClaimDoctorDto,
  SubmitUnIdentifiedClaimDto,
  type CreateEmergencyIdentifiedClaimDto,
  type CreateEmergencyUnidentifiedClaimDto,
} from './types';
import { CreateEmergencyIdentifiedClaimRequestDto } from './dto/create-emergency-identified-claim-request.dto';
import { SubmitUnIdentifiedClaimRequestDto } from './dto/submit-unidentified-claim-request.dto';
import { IdentifyUknownEmergencyCaseRequestDto } from './dto/identify-uknown-emergency-case-patient-request.dto';
import { AddEmergencyClaimDoctorRequestDto } from './dto/add-emergency-claim-doctor-request.dto';
import { RemoveEmergencyClaimDoctorRequestDto } from './dto/remove-emergency-claim-doctors-request.dto';
import { GetEmergencyClaimProtocolsRequestDto } from './dto/get-emergency-protocols-request.dto';
import { AddEmergencyClaimProtocolsRequestDto } from './dto/add-emergency-claim-protocols-request.dto';

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

  @Get('claim/interventions')
  public getEmergencyClaimInterventions() {
    return this.emergencyClaimService.getSHAEmergencyInterventions();
  }

  @Post('claim/unidentified/identified')
  public identifyUnidentifiedClaimPatient(
    @Body() body: IdentifyUknownEmergencyCaseRequestDto,
  ) {
    const payload: IdentifyUknownEmergencyCaseDto = {
      interventions: body.interventionCodes,
      mode_of_arrival: body.modeOfArrival,
      brought_by: body.broughtBy,
      reference_number: body.referenceNumber,
      identification_number: body.identificationNumber,
      identification_type: body.identificationType,
      regulation_body: body.regulationBody,
      beneficiary_cr_id: body.beneficiaryCrId,
      otp: body.otp,
      consent_token: body.consentToken,
    };
    if (body.beneficiaryContactId) {
      payload['beneficiary_contact_id'] = body.beneficiaryContactId;
    }
    if (body.notes) {
      payload['notes'] = body.notes;
    }
    return this.emergencyClaimService.identifyUnidentifiedClaimPatient(
      payload,
      body.locationUuid,
    );
  }

  @Post('claim/doctors')
  public addEmergencyClaimDoctor(
    @Body() body: AddEmergencyClaimDoctorRequestDto,
  ) {
    const payload: AddEmergencyClaimDoctorDto = {
      consent_token: body.consentToken,
      identification_number: body.identificationNumber,
      identification_type: body.identificationType,
      regulation_body: body.regulationBody,
    };
    return this.emergencyClaimService.addEmergencyClaimDoctor(
      payload,
      body.locationUuid,
    );
  }
  @Delete('claim/doctors')
  public removeEmergencyClaimDoctors(
    @Body() body: RemoveEmergencyClaimDoctorRequestDto,
  ) {
    const payload: RemoveEmergencyClaimDoctorDto = {
      consent_token: body.consentToken,
    };
    return this.emergencyClaimService.removeEmergencyClaimDoctor(
      payload,
      body.locationUuid,
    );
  }
  @Get('claim/protocols')
  public getEmergencyClaimProtocols(
    @Query() query: GetEmergencyClaimProtocolsRequestDto,
  ) {
    const payload: GetEmergencyClaimProtocolsDto = {
      intervention_code: query.interventionCode,
      active: query.active,
    };
    return this.emergencyClaimService.fetchEmergencyClaimProtocols(
      payload,
      query.locationUuid,
    );
  }
  @Post('claim/protocols')
  public addEmergencyClaimProtocols(
    @Body() body: AddEmergencyClaimProtocolsRequestDto,
  ) {
    const payload: AddEmergencyClaimProtocolsDto = {
      intervention_code: body.interventionCode,
      protocol_code: body.protocolCode,
      unit_price: body.unitPrice,
      quantity: body.unitPrice,
      consent_token: body.consentToken,
    };
    return this.emergencyClaimService.addEmergencyClaimProtocol(
      payload,
      body.locationUuid,
    );
  }
}
