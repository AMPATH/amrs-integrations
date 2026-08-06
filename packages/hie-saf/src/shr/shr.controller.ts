import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import type { Request } from 'express';
import { OpenMrsAuthGuard } from '../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { FetchPatientRecordsDto } from './dto/fetch-patient-records.dto';
import { FetchResourceLabelsDto } from './dto/fetch-resource-labels.dto';
import { RequestShrConsentDto } from './dto/request-shr-consent.dto';
import { ShrLocationRequestDto } from './dto/shr-location-request.dto';
import {
  ShrConsentParamsDto,
  ShrVisitParamsDto,
} from './dto/shr-path-params.dto';
import { SubmitShrBundleDto } from './dto/submit-shr-bundle.dto';
import { SubmitShrBundleQueryDto } from './dto/submit-shr-bundle-query.dto';
import { VerifyShrConsentDto } from './dto/verify-shr-consent.dto';
import { CONSENT_TOKEN_HEADER, ShrService } from './shr.service';
import { PractitionerResolver } from '../shared/utils/practitioner-resolver.helper';

/**
 * Shared Health Record read/write path. Consent tokens are handed back to
 * the caller and passed in again on reads and writes — nothing is held
 * server side.
 */
@UseGuards(OpenMrsAuthGuard)
@Controller('shr')
export class ShrController {
  constructor(
    private readonly shrService: ShrService,
    private readonly practitionerResolver: PractitionerResolver,
  ) {}

  @Post('consents')
  requestConsent(@Body() body: RequestShrConsentDto) {
    return this.shrService.requestConsent(body);
  }

  @Post('consents/:consentId/verify')
  verifyConsent(
    @Param() params: ShrConsentParamsDto,
    @Body() body: VerifyShrConsentDto,
  ) {
    return this.shrService.verifyConsent(params.consentId, body);
  }

  @Get('consents/:consentId/status')
  getConsentStatus(
    @Param() params: ShrConsentParamsDto,
    @Query() query: ShrLocationRequestDto,
  ) {
    return this.shrService.getConsentStatus(
      params.consentId,
      query.locationUuid,
    );
  }

  @Post('consents/:consentId/resend-otp')
  resendConsentOtp(
    @Param() params: ShrConsentParamsDto,
    @Body() body: ShrLocationRequestDto,
  ) {
    return this.shrService.resendConsentOtp(
      params.consentId,
      body.locationUuid,
    );
  }

  @Post('bundles')
  @ApiHeader({
    name: CONSENT_TOKEN_HEADER,
    required: false,
    description:
      'Per visit consent token from verify/refresh. Falls back to the consentToken query param.',
  })
  submitBundle(
    @Body() body: SubmitShrBundleDto,
    @Query() query: SubmitShrBundleQueryDto,
    @Headers('x-consent-token') consentTokenHeader?: string,
  ) {
    const consentToken = consentTokenHeader ?? query.consentToken;
    if (!consentToken) {
      throw new BadRequestException(
        `Missing consent token. Send it as the ${CONSENT_TOKEN_HEADER} header or the consentToken query param.`,
      );
    }
    return this.shrService.submitBundle(body, query.locationUuid, consentToken);
  }

  @Get('patient-records')
  @ApiHeader({
    name: CONSENT_TOKEN_HEADER,
    required: false,
    description:
      'Per visit consent token from verify/refresh. Falls back to the consentToken query param.',
  })
  async fetchPatientRecords(
    @Query() query: FetchPatientRecordsDto,
    @Req() request: Request,
    @Headers('x-consent-token') consentTokenHeader?: string,
  ) {
    const consentToken = consentTokenHeader ?? query.consentToken;
    if (!consentToken) {
      throw new BadRequestException(
        `Missing consent token. Send it as the ${CONSENT_TOKEN_HEADER} header or the consentToken query param.`,
      );
    }
    const practitionerId =
      await this.practitionerResolver.resolveLoggedInPractitionerId(
        request.cookies?.['JSESSIONID'] as string | undefined,
        query.locationUuid,
      );
    return this.shrService.fetchPatientRecords(
      query,
      practitionerId,
      consentToken,
    );
  }

  @Post('visits/:visitId/refresh')
  @ApiHeader({
    name: CONSENT_TOKEN_HEADER,
    required: false,
    description:
      'Consent token being refreshed, when the caller still holds it.',
  })
  refreshVisitConsent(
    @Param() params: ShrVisitParamsDto,
    @Body() body: ShrLocationRequestDto,
    @Headers('x-consent-token') consentToken?: string,
  ) {
    return this.shrService.refreshVisitConsent(
      params.visitId,
      body.locationUuid,
      consentToken,
    );
  }

  @Post('visits/:visitId/close')
  closeVisit(
    @Param() params: ShrVisitParamsDto,
    @Body() body: ShrLocationRequestDto,
  ) {
    return this.shrService.closeVisit(params.visitId, body.locationUuid);
  }

  @Get('resource-labels')
  fetchResourceLabels(@Query() query: FetchResourceLabelsDto) {
    if (!query.resourceName && !query.code) {
      throw new BadRequestException('Provide resourceName and/or code');
    }
    return this.shrService.fetchResourceLabels(query);
  }
}
