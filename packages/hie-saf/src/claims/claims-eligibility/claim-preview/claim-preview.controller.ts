import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { PreviewProviderClaimRequestDto } from './dto/provider-claim-preview-request.dto';
import { PreviewPayerClaimDto, PreviewProviderClaimDto } from './types';
import { ClaimPreviewService } from './claim-preview.service';
import { PreviewPayerClaimRequestDto } from './dto/payer-claim-preview-request.dto';

@UseGuards(OpenMrsAuthGuard)
@Controller('claim-preview')
export class ClaimPreviewController {
  constructor(private readonly claimPreviewService: ClaimPreviewService) {}

  @Get('provider')
  public previewProviderClaim(@Query() query: PreviewProviderClaimRequestDto) {
    if (!query?.consentToken && !query?.locationUuid) {
      throw new BadRequestException('Missing token or locationUuid');
    }
    const previewProviderClaimDto: PreviewProviderClaimDto = {
      consent_token: query.consentToken,
    };
    return this.claimPreviewService.previewProviderClaim(
      previewProviderClaimDto,
      query.locationUuid,
    );
  }
  @Get('payer')
  public previewPayerClaim(@Query() query: PreviewPayerClaimRequestDto) {
    if (!query?.guid && !query?.providerClaimNo) {
      throw new BadRequestException('Missing guid or provider claim no');
    }
    const payload: PreviewPayerClaimDto = {};
    if (query.guid) {
      payload['guid'] = query.guid;
    }
    if (query.providerClaimNo) {
      payload['provider_claim_no'] = query.providerClaimNo;
    }

    return this.claimPreviewService.previewPayerClaim(
      payload,
      query.locationUuid,
    );
  }
}
