import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import { AddClaimAttachmentRequestDto } from './dto/add-claim-attachment-request.dto';
import {
  type AddClaimAttachmentReponse,
  ClaimAttachmentActions,
  type RemoveClaimAttachmentDto,
} from './types';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClaimAttachment } from '../../../core/database/entities/claim-attachment.entity';

@Injectable()
export class ClaimAttachmentService {
  constructor(
    @InjectRepository(ClaimAttachment)
    private claimAttachmentRepository: Repository<ClaimAttachment>,
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
      const data = (await response.json()) as AddClaimAttachmentReponse;
      if ('error' in data) {
        Logger.error(data);
        return data;
      }
      if (data) {
        try {
          const addClaimAttachmentEntity =
            this.claimAttachmentRepository.create({
              locationUuid: locationUuid,
              claimAttachmentAction: ClaimAttachmentActions.Add,
              documentType: addClaimAttachmentRequestDto.documentType,
              consentToken: addClaimAttachmentRequestDto.consentToken,
              interventionCode: addClaimAttachmentRequestDto.interventionCode,
              claimAttachmentResponse: data,
            });
          await this.claimAttachmentRepository.save(addClaimAttachmentEntity);
        } catch (error) {
          Logger.error(error);
        }
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
  async removeClaimAttachment(
    removeClaimAttachmentDto: RemoveClaimAttachmentDto,
    locationUuid: string,
  ): Promise<any> {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const removeClaimAttachmentUrl = `${baseUrl}/api/v1/claims/attachments`;
    try {
      const response = await this.hieHttpRequests.sendPatchRequest(
        removeClaimAttachmentUrl,
        removeClaimAttachmentDto,
        locationUuid,
      );
      const data = await response.json();
      if ('error' in data) {
        Logger.error(data);
        return data;
      }
      try {
        const removeAttachmentEntity = this.claimAttachmentRepository.create({
          locationUuid: locationUuid,
          claimAttachmentAction: ClaimAttachmentActions.Remove,
          consentToken: removeClaimAttachmentDto.consent_token,
          interventionCode: removeClaimAttachmentDto.intervention_code,
          attachmentId: removeClaimAttachmentDto.attachment_id,
          claimAttachmentResponse: data,
        });
        await this.claimAttachmentRepository.save(removeAttachmentEntity);
      } catch (error) {
        Logger.error(error);
      }
      return data ?? [];
    } catch (error) {
      console.error(error);
      throw new HttpException(
        'Error remoing attachment',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
