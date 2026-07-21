import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { ClaimSubmissionService } from './claim-submission.service';
import { SubmitClaimDto, SubmitInpatientClaimDto } from './types';
import { SubmitClaimRequestDto } from './dto/submit-claim-request.dto';
import { SubmitInpatientClaimRequestDto } from './dto/submit-inpatient-claim-request.dto';

@UseGuards(OpenMrsAuthGuard)
@Controller('claim-submission')
export class ClaimSubmissionController {
  constructor(
    private readonly claimSubmissionService: ClaimSubmissionService,
  ) {}

  @Post()
  public submitClaim(@Body() body: SubmitClaimRequestDto) {
    if (!body.otp && !body.dischargeAuthGuid) {
      throw new BadRequestException('Missing both otp and discharge auth guid');
    }
    const submitClaimDto: SubmitClaimDto = {
      consent_token: body.consentToken,
      invoice_number: body.invoiceNumber,
      discharge_reason: body.dischargeReason,
      notes: body.notes,
    };
    if (body.otp) {
      submitClaimDto['otp'] = body.otp;
    }
    if (body.dischargeAuthGuid) {
      submitClaimDto['discharge_auth_guid'] = body.dischargeAuthGuid;
    }

    return this.claimSubmissionService.submitClaim(
      submitClaimDto,
      body.locationUuid,
    );
  }

  @Post('inpatient')
  public submitInpatientsClaim(@Body() body: SubmitInpatientClaimRequestDto) {
    if (!body.otp && !body.dischargeAuthGuid) {
      throw new BadRequestException('Missing both otp and discharge auth guid');
    }
    const submitClaimDto: SubmitInpatientClaimDto = {
      consent_token: body.consentToken,
      invoice_number: body.invoiceNumber,
      discharge_reason: body.dischargeReason,
      notes: body.notes,
      discharge_date: body.dischargeDate,
    };
    if (body.otp) {
      submitClaimDto['otp'] = body.otp;
    }
    if (body.dischargeAuthGuid) {
      submitClaimDto['discharge_auth_guid'] = body.dischargeAuthGuid;
    }

    return this.claimSubmissionService.submitInpatientClaim(
      submitClaimDto,
      body.locationUuid,
    );
  }
}
