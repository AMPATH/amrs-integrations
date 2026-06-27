import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { ClaimSubmissionService } from './claim-submission.service';
import { SubmitClaimDto } from './types';
import { SubmitClaimRequestDto } from './dto/submit-claim-request.dto';

@UseGuards(OpenMrsAuthGuard)
@Controller('claim-submission')
export class ClaimSubmissionController {
  constructor(
    private readonly claimSubmissionService: ClaimSubmissionService,
  ) {}

  @Post()
  public submitClaim(@Body() body: SubmitClaimRequestDto) {
    const submitClaimDto: SubmitClaimDto = {
      consent_token: body.consentToken,
      invoice_number: body.invoiceNumber,
    };
    return this.claimSubmissionService.submitClaim(
      submitClaimDto,
      body.locationUuid,
    );
  }
}
