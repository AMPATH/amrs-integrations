import {
  Body,
  Controller,
  Delete,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { ClaimAttachmentService } from './claim-attachment.service';
import { AddClaimAttachmentRequestDto } from './dto/add-claim-attachment-request.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { RemoveClaimAttachmentRequestDto } from './dto/remove-claim-attachment-request.dto';
import { RemoveClaimAttachmentDto } from './types';

@UseGuards(OpenMrsAuthGuard)
@Controller('claim-attachment')
export class ClaimAttachmentController {
  constructor(
    private readonly claimAttachmentService: ClaimAttachmentService,
  ) {}
  @Post()
  @UseInterceptors(FileInterceptor('fileBlob'))
  public createOtpWhitelistRequest(
    @UploadedFile() file: any,
    @Body() body: AddClaimAttachmentRequestDto,
  ) {
    return this.claimAttachmentService.addClaimAttachment(
      body,
      body.locationUuid,
      file,
    );
  }
  @Delete()
  public removeClaimLine(@Body() body: RemoveClaimAttachmentRequestDto) {
    const removeClaimAttachmentDto: RemoveClaimAttachmentDto = {
      consent_token: body.consentToken,
      attachment_id: body.attachmentId,
      intervention_code: body.interventionCode,
    };
    return this.claimAttachmentService.removeClaimAttachment(
      removeClaimAttachmentDto,
      body.locationUuid,
    );
  }
}
