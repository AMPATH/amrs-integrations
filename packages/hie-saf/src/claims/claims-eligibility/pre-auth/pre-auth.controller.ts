import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { CreateNormalPreAuthRequestDto } from './dto/create-normal-pre-auth.request.dto';
import { PreAuthService } from './pre-auth.service';
import { PreAuthPreviewRequestDto } from './dto/pre-auth-preview-request.dto';
import { ResendDoctorConsentDto } from './dto/resend-doctor-consent.dto';
import { PreAuthPreviewDto, type UploadedPreauthFile } from './types';
import { CreatePreAuthRequestDto } from './dto/create-pre-auth-request.dto';
import { SearchPreAuthDto } from './dto/search-pre-auth-request.dto';
import { UpdatePreAuthRequestDto } from './dto/update-pre-auth-request.dto';

@UseGuards(OpenMrsAuthGuard)
@Controller('pre-auth')
export class PreAuthController {
  constructor(private readonly preAuthService: PreAuthService) {}

  /**
   * Normal preauth — accepts the same multipart shape as HIE POST /api/v1/preauths:
   *   consent_token, intervention_code, service_start, service_end,
   *   items, diagnoses, doctors, attachments (JSON strings),
   *   provider_notification_email, attachments_N_file_blob (files),
   * plus locationUuid for facility routing.
   */
  @Post('normal')
  @UseInterceptors(AnyFilesInterceptor())
  public createNormalPreAuth(
    @UploadedFiles() files: UploadedPreauthFile[],
    @Body() body: CreateNormalPreAuthRequestDto,
  ) {
    // Multipart text fields land on @Body() (including locationUuid). Required for
    // x-facility-id routing — without it HIE may attribute the call to the OAuth client facility.
    if (!body?.locationUuid?.trim()) {
      throw new BadRequestException('Missing locationUuid');
    }
    return this.preAuthService.createNormalPreauth(
      body,
      body.locationUuid.trim(),
      files ?? [],
    );
  }

  /**
   * Resend doctor approval request (SMS) for a preauth awaiting doctor consent.
   * @see https://hie-docs.dha.go.ke/eclaims/preauth-doctor-consent
   */
  @Post('doctor-consent')
  public resendDoctorConsent(@Body() body: ResendDoctorConsentDto) {
    return this.preAuthService.resendDoctorConsent(body);
  }

  @Get('preview')
  public getPreAuthPreview(@Query() query: PreAuthPreviewRequestDto) {
    if (!query.consentToken) {
      throw new BadRequestException('Missing consent token');
    }
    const preAuthPreviewDto: PreAuthPreviewDto = {
      consent_token: query.consentToken,
    };
    return this.preAuthService.getPreAuthPreview(
      preAuthPreviewDto,
      query.locationUuid,
    );
  }
  @Post('request')
  public createPreAuthRequest(
    @Body() createPreAuthRequest: CreatePreAuthRequestDto,
  ) {
    return this.preAuthService.createPreAuthRequest(createPreAuthRequest);
  }
  @Get('request')
  public async getPreAuthRequest(@Query() query: SearchPreAuthDto) {
    return this.preAuthService.getPreAuthRequest(query);
  }
  @Patch('request/:id')
  public updatePreAuthRequest(
    @Body() body: UpdatePreAuthRequestDto,
    @Param('id') id: number,
  ) {
    if (!id || !body) {
      throw new BadRequestException();
    }
    return this.preAuthService.updatePreAuthRequest(body, id);
  }
}
