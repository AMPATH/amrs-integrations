import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
import { PreAuthPreviewDto, type UploadedPreauthFile } from './types';

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
    return this.preAuthService.createNormalPreauth(
      body,
      body.locationUuid,
      files ?? [],
    );
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
}
