import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { ClaimLineService } from './claim-line.service';
import { AddClaimLineRequestDto } from './dto/add-claim-line-request.dto';
import { AddClaimLineDto, RemoveClaimLineDto } from './types';
import { RemoveClaimLineRequestDto } from './dto/remove-claim-line-request.dto';

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
  @Delete()
  public removeClaimLine(@Body() body: RemoveClaimLineRequestDto) {
    const removeClaimLineDto: RemoveClaimLineDto = {
      consent_token: body.consentToken,
      line_guid: body.lineGuid,
    };
    return this.claimLineService.removeClaimLine(
      removeClaimLineDto,
      body.locationUuid,
    );
  }
}
