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
import { ClaimAuthorizationService } from './claim-authorization.service';
import { ClaimAuthorizationsRequestDto } from './dto/claim-authorizations-request.dto';
import { CancelPendingAuthorizationsRequestDto } from './dto/cancel-pending-authorizations-request.dto';
import { CancelPendingAuthorizationDto } from './types';

@UseGuards(OpenMrsAuthGuard)
@Controller('claim-authorizations')
export class ClaimAuthorizationController {
  constructor(
    private readonly claimAuthorizationService: ClaimAuthorizationService,
  ) {}

  @Get()
  public getAuthorizations(@Query() query: ClaimAuthorizationsRequestDto) {
    if (!query.beneficiaryCode && !query.consentToken) {
      throw new BadRequestException(
        'Missing beneficiary code or consent tokan',
      );
    }
    return this.claimAuthorizationService.getAuthorizations(
      query,
      query.locationUuid,
    );
  }
  @Post('cancel')
  public cancelPendingAuthorizations(
    @Body() body: CancelPendingAuthorizationsRequestDto,
  ) {
    const cancelPendingAuthorizationDto: CancelPendingAuthorizationDto = {
      consentToken: body.consentToken,
    };
    return this.claimAuthorizationService.cancelPendingAuthorizations(
      cancelPendingAuthorizationDto,
      body.locationUuid,
    );
  }
}
