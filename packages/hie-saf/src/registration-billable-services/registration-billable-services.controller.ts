import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { OpenMrsAuthGuard } from '../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { CreateRegistrationBillableServiceDto } from './dto/create-registration-billable-service.dto';
import { RegistrationBillableServiceService } from './registration-billable-services.service';
import { SearchRegistrationBillableServiceDto } from './dto/search-registration-billable-service.dto';

@UseGuards(OpenMrsAuthGuard)
@Controller('registration-billable-service')
export class RegistrationBillableServiceController {
  constructor(
    private registrationBillableServiceService: RegistrationBillableServiceService,
  ) {}
  @Post()
  public create(@Body() body: CreateRegistrationBillableServiceDto) {
    return this.registrationBillableServiceService.create(body);
  }
  @Get()
  public find(@Query() query: SearchRegistrationBillableServiceDto) {
    return this.registrationBillableServiceService.find(query);
  }
}
