import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { ClaimLineService } from './claim-line.service';
import { AddClaimLineRequestDto } from './dto/add-claim-line-request.dto';
import { AddClaimLineDto } from './types';

@UseGuards(OpenMrsAuthGuard)
@Controller('claim-line')
export class ClaimLineController {
  constructor(private readonly claimLineService: ClaimLineService) {}

  @Post()
  public addClaimLine(@Body() body: AddClaimLineRequestDto) {
    const addClaimLineDto: AddClaimLineDto = {
      consent_token: body.consentToken,
      intervention_code: body.interventionCode,
      service_name: body.serviceName,
      service_identifier: body.serviceIdentifier,
      unit_price: body.unitPrice,
      quantity: body.quantity,
      scheme_code: body.schemeCode,
    };
    return this.claimLineService.addClaimLine(
      addClaimLineDto,
      body.locationUuid,
    );
  }
}
