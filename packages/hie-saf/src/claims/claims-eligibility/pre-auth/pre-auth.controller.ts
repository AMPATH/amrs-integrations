import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateNormalPreAuthRequestDto } from './dto/create-normal-pre-auth.request.dto';
import { PreAuthService } from './pre-auth.service';
import { PreAuthPreviewRequestDto } from './dto/pre-auth-preview-request.dto';
import { PreAuthPreviewDto } from './types';

@UseGuards(OpenMrsAuthGuard)
@Controller('pre-auth')
export class PreAuthController {
  constructor(private readonly preAuthService: PreAuthService) {}
  @Post('normal')
  @UseInterceptors(FileInterceptor('fileBlob'))
  public createNormalPreAuth(
    @UploadedFile() file: any,
    @Body() body: CreateNormalPreAuthRequestDto,
  ) {
    return this.preAuthService.createNormalPreauth(
      body,
      body.locationUuid,
      file,
    );
  }
  @Get('preview')
  public getPreAuthPreview(@Query() query: PreAuthPreviewRequestDto) {
    if (!query.consentToken && !query.consentToken) {
      throw new BadRequestException('Missing consent tokan');
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
