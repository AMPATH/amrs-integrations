import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { BillOrderService } from './bill-order.service';
import { CreateBillOrderDto } from './dto/create-bill-order.dto';
import { SearchBillOrderDto } from './dto/search-bill-order.dto';

@UseGuards(OpenMrsAuthGuard)
@Controller('bill-order')
export class BillOrderController {
  constructor(private readonly billOrderService: BillOrderService) {}
  @Get()
  findBillOrder(@Query() query: SearchBillOrderDto) {
    return this.billOrderService.findOne(query);
  }
  @Post()
  fetchPatientSubBenefits(@Body() body: CreateBillOrderDto) {
    return this.billOrderService.createBillOrder(body);
  }
}
