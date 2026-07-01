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
    const addClaimLineDto: Partial<AddClaimLineDto> = {
      consent_token: body.consentToken,
      intervention_code: body.interventionCode,
      unit_price: body.unitPrice,
      quantity: body.quantity,
    };
    if (body?.serviceName) {
      addClaimLineDto['service_name'] = body.serviceName;
    }
    if (body.serviceIdentifier) {
      addClaimLineDto['service_identifier'] = body.serviceIdentifier;
    }
    if (body.schemeCode) {
      addClaimLineDto['scheme_code'] = body.schemeCode;
    }
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
