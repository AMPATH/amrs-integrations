import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { ClaimDischargeService } from './claim-discharge.service';
import { ClaimDischargeRequestDto } from './dto/claims-discharge-request.dto';
import { ClaimDischargeDto } from './types';

@UseGuards(OpenMrsAuthGuard)
@Controller('claim-discharge')
export class ClaimDischargeController {
  constructor(private readonly claimDischargeService: ClaimDischargeService) {}

  @Post()
  public dichargeClaim(@Body() body: ClaimDischargeRequestDto) {
    if (!body.otp && !body.dischargeAuthGuid) {
      throw new BadRequestException('Missing both otp and discharge auth guid');
    }
    const claimDischargeDto: ClaimDischargeDto = {
      consent_token: body.consentToken,
      discharge_date: body.dischargeDate,
      invoice_number: body.invoiceNumber,
      discharge_reason: body.dischargeReason,
      notes: body.notes,
    };
    if (body.otp) {
      claimDischargeDto['otp'] = body.otp;
    }
    if (body.dischargeAuthGuid) {
      claimDischargeDto['discharge_auth_guid'] = body.dischargeAuthGuid;
    }

    return this.claimDischargeService.dichargeClaim(
      claimDischargeDto,
      body.locationUuid,
    );
  }
}
