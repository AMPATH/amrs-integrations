import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';

import { IdentifierTypeHelper } from '../shared/utils/identifier-type';
import { EligibilityService } from './eligibility.service';
import type { ClientEligibilityParamsDto } from './dto/client-eligibility-params.dto';
import type { ClientEligibilitySearchDto } from './dto/client-eligibility-search.dto';
import { OpenMrsAuthGuard } from '../auth/guards/openmrs-auth-guard/openmrs-auth.guard';

@UseGuards(OpenMrsAuthGuard)
@Controller('eligibility')
export class EligibilityController {
  constructor(
    private readonly identifierTypeHelper: IdentifierTypeHelper,
    private eligibilityService: EligibilityService,
  ) {}
  @Post()
  public getClientEligibilityStatus(@Body() body: ClientEligibilityParamsDto) {
    const identificationTypeName =
      this.identifierTypeHelper.getIdentifierTypeByNumber(body.requestIdType);
    if (!identificationTypeName) {
      throw new HttpException(
        'Uknown Identification type',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!body.requestIdNumber) {
      throw new HttpException(
        'Missing Identification Number',
        HttpStatus.BAD_REQUEST,
      );
    }
    const eligibilityDto: ClientEligibilitySearchDto = {
      identificationNumber: body.requestIdNumber,
      identificationType: identificationTypeName,
    };
    return this.eligibilityService.fetchClientEligibilityStatus(eligibilityDto);
  }
}
