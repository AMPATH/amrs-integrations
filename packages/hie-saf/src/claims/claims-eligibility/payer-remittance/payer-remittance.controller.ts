import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { PayerRemittanceService } from './payer-remittance.service';
import { PayerRemittanceDto } from './dto/payer-remittance.dto';

@UseGuards(OpenMrsAuthGuard)
@Controller('payer-remittance')
export class PayerRemittanceController {
  constructor(
    private readonly payerRemittanceService: PayerRemittanceService,
  ) {}

  @Post()
  public previewProviderClaim(@Body() body: PayerRemittanceDto) {
    if (!body?.claimGuid && !body?.locationUuid) {
      throw new BadRequestException('Missing claim. guid or locationUuid');
    }
    return this.payerRemittanceService.fetchPayerRemittance(body);
  }
}
