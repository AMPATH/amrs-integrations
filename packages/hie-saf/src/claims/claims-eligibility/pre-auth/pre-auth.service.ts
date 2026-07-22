import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import { CreateNormalPreAuthRequestDto } from './dto/create-normal-pre-auth.request.dto';
import { PreAuthPreviewRequestDto } from './dto/pre-auth-preview-request.dto';
import { PreAuthPreviewDto } from './types';

@Injectable()
export class PreAuthService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async createNormalPreauth(
    createPreAuthRequestDto: CreateNormalPreAuthRequestDto,
    locationUuid: string,
    file: any,
  ) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const createPreAuthUrl = `${baseUrl}/api/v1/preauths`;

    const externalFormData = new FormData();

    try {
      if (file) {
        if (!file.originalname) {
          return false;
        }
        const originalname = (file?.originalname as unknown as string) ?? '';
        const fileBlob = new Blob([file.buffer], { type: file.mimetype });
        externalFormData.append(
          'attachments_0_file_blob',
          fileBlob,
          originalname,
        );
      }
      externalFormData.append(
        'consent_token',
        createPreAuthRequestDto.consentToken,
      );
      externalFormData.append(
        'intervention_code',
        createPreAuthRequestDto.interventionCode,
      );
      externalFormData.append(
        'service_start',
        createPreAuthRequestDto.serviceStart,
      );
      externalFormData.append(
        'service_end',
        createPreAuthRequestDto.serviceEnd,
      );

      externalFormData.append(
        'items',
        JSON.stringify(createPreAuthRequestDto.items),
      );

      externalFormData.append(
        'diagnoses',
        JSON.stringify(createPreAuthRequestDto.diagnoses),
      );

      externalFormData.append(
        'doctors',
        JSON.stringify(createPreAuthRequestDto.doctors),
      );

      externalFormData.append(
        'attachments',
        JSON.stringify(createPreAuthRequestDto.attachments),
      );

      externalFormData.append(
        'provider_notification_email',
        createPreAuthRequestDto.providerNotificationEmail,
      );

      console.log({ externalFormData });
    } catch (error: any) {
      throw new InternalServerErrorException(
        `Failed to forward form data: ${error.message}`,
      );
    }
    try {
      const response = await this.hieHttpRequests.sendFormDataPostRequest(
        createPreAuthUrl,
        externalFormData,
        locationUuid,
      );
      const data = await response.json();
      if ('error' in data) {
        Logger.error(data);
        return data;
      }
      return data ?? [];
    } catch (error) {
      console.error(error);
      throw new HttpException(
        'Error adding file attachment',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async getPreAuthPreview(
    preAuthPreviewDto: PreAuthPreviewDto,
    locationUuid: string,
  ) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const preAuthPreviewUrl = `${baseUrl}/api/preauths?consent_token=${preAuthPreviewDto.consent_token}`;

    try {
      const response = await this.hieHttpRequests.sendGetRequest(
        preAuthPreviewUrl,
        locationUuid,
      );
      const data = await response.json();
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error getting pre auth preview',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
