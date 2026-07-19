import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
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
    return this.claimAuthorizationService.getAuthorizations(
      query.beneficiaryCode,
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
