import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import type { Request } from 'express';
import { OpenMrsAuthGuard } from '../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { CONSENT_TOKEN_HEADER } from '../shr.service';
import { SubmitShrVisitDto } from './dto/submit-shr-visit.dto';
import { VisitSubmissionResponse } from './types';
import { ShrVisitSubmissionService } from './shr-visit-submission.service';

/**
 * `POST /shr/visit-submission` — one endpoint, one closed visit:
 *
 *   { patientUuid, locationUuid, visitUuid?, consentToken?, dryRun? }
 *     → { status: "submitted" | "validated" | "skipped" | "failed", ... }
 *
 * Declared under the existing `shr` controller's route prefix — the DHA
 * workflow app's frontend calls it as `POST /shr/visit-submission` on the same
 * middleware base URL it already uses for consent and bundle calls. The
 * `OpenMrsAuthGuard` validates the caller's `JSESSIONID` before this runs, so
 * the patient/visit read below rides exactly that session.
 */
@UseGuards(OpenMrsAuthGuard)
@Controller('shr')
export class ShrVisitSubmissionController {
  constructor(
    private readonly shrVisitSubmissionService: ShrVisitSubmissionService,
  ) {}

  @Post('visit-submission')
  @ApiHeader({
    name: CONSENT_TOKEN_HEADER,
    required: false,
    description:
      'Per visit consent token from verify/refresh. Falls back to the consentToken body field, ' +
      'then to the recorded consent session (GET /shr/consents/active resolution).',
  })
  submitClosedVisit(
    @Body() body: SubmitShrVisitDto,
    @Req() request: Request,
    @Headers('x-consent-token') consentTokenHeader?: string,
  ): Promise<VisitSubmissionResponse> {
    return this.shrVisitSubmissionService.submitClosedVisit(
      body,
      request.cookies?.['JSESSIONID'] as string | undefined,
      consentTokenHeader,
    );
  }
}
