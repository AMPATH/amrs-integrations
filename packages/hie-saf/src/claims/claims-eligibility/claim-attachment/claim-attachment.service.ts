import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import { AddClaimAttachmentRequestDto } from './dto/add-claim-attachment-request.dto';

@Injectable()
export class ClaimAttachmentService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async addClaimAttachment(
    addClaimAttachmentRequestDto: AddClaimAttachmentRequestDto,
    locationUuid: string,
    file: any,
  ) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const addClaimAttachmentUrl = `${baseUrl}/api/v1/claims/attachments`;

    const externalFormData = new FormData();

    try {
      if (file) {
        if (!file.originalname) {
          return false;
        }
        const originalname = (file?.originalname as unknown as string) ?? '';
        console.log({ originalname });
        const fileBlob = new Blob([file.buffer], { type: file.mimetype });
        externalFormData.append('file_blob', fileBlob, originalname);
      }

      // map the data
      externalFormData.append(
        'consent_token',
        addClaimAttachmentRequestDto.consentToken,
      );
      externalFormData.append(
        'document_type',
        addClaimAttachmentRequestDto.documentType,
      );
      externalFormData.append(
        'intervention_code',
        addClaimAttachmentRequestDto.interventionCode,
      );

      console.log({ externalFormData });
    } catch (error: any) {
      throw new InternalServerErrorException(
        `Failed to forward form data: ${error.message}`,
      );
    }
    try {
      const response = await this.hieHttpRequests.sendFormDataPostRequest(
        addClaimAttachmentUrl,
        externalFormData,
        locationUuid,
      );
      const data = await response.json();
      return data ?? [];
    } catch (error) {
      console.error(error);
      throw new HttpException(
        'Error adding file attachment',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
