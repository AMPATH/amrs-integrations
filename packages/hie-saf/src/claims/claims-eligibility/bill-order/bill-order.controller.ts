import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
    const queryPayload: Partial<SearchBillOrderDto> = {};
    if (query.bill_uuid) {
      queryPayload['bill_uuid'] = query.bill_uuid;
    }
    if (query.order_no) {
      queryPayload['order_no'] = query.order_no;
    }
    if (Object.values(query).length === 0) {
      throw new BadRequestException();
    }
    return this.billOrderService.findOne(queryPayload);
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
  createBillOrder(@Body() body: CreateBillOrderDto) {
    const payload: Partial<CreateBillOrderDto> = {
      bill_uuid: body.bill_uuid,
      line_item_uuid: body.line_item_uuid,
      order_no: body.order_no,
    };
    if (body.patient_uuid) {
      payload['bill_uuid'] = body.bill_uuid;
    }
    if (body.sub_benefit_code) {
      payload['sub_benefit_code'] = body.sub_benefit_code;
    }
    if (body.intervention_code) {
      payload['intervention_code'] = body.intervention_code;
    }
    if (body.consent_token) {
      payload['consent_token'] = body.consent_token;
    }
    if (body.service_type) {
      payload['service_type'] = body.service_type;
    }
    if (body.requires_preauth) {
      payload['requires_preauth'] = body.requires_preauth;
    }
    if (body.normal_preauth) {
      payload['normal_preauth'] = body.normal_preauth;
    }
    if (body.elective_preauth) {
      payload['elective_preauth'] = body.elective_preauth;
    }
    if (body.preauth_approved) {
      payload['preauth_approved'] = body.preauth_approved;
    }
    if (body.required_documents) {
      payload['required_documents'] = body.required_documents;
    }
    if (body.applicable_document_types) {
      payload['applicable_document_types'] = body.applicable_document_types;
    }
    if (body.required_preauth_document_types) {
      payload['required_preauth_document_types'] =
        body.required_preauth_document_types;
    }
    return this.billOrderService.createBillOrder(payload);
  }
}
