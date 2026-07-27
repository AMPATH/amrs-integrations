import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { BillOrderService } from './bill-order.service';
import { CreateBillOrderDto } from './dto/create-bill-order.dto';
import { SearchBillOrderDto } from './dto/search-bill-order.dto';
import { FindBillOrderByPatientUuidBlankConsentDto } from './dto/find-bill-order-by-patient-uuid-blank-consent.dto';
import { UpdateBillOrderConsentTokenDto } from './dto/update-bill-order-consent-token.dto';

@UseGuards(OpenMrsAuthGuard)
@Controller('bill-order')
export class BillOrderController {
  constructor(private readonly billOrderService: BillOrderService) {}

  @Get()
  findBillOrder(@Query() query: SearchBillOrderDto) {
    return this.billOrderService.findOne(query);
  }

  @Get('patient-claim-bill-order')
  findBillOrderByPatientUuidWithBlankConsentToken(
    @Query() query: FindBillOrderByPatientUuidBlankConsentDto,
  ) {
    return this.billOrderService.findBillOrderByPatientUuidWithBlankConsentToken(
      query.patient_uuid,
    );
  }

  @Patch(':id/consent-token')
  updateBillOrderConsentToken(
    @Param('id') id: string,
    @Body() body: UpdateBillOrderConsentTokenDto,
  ) {
    return this.billOrderService.updateBillOrderConsentToken(
      id,
      body.consent_token,
    );
  }

  @Post()
  fetchPatientSubBenefits(@Body() body: CreateBillOrderDto) {
    return this.billOrderService.createBillOrder(body);
  }
}
