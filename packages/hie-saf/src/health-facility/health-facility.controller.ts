import { Controller, Get, Query } from '@nestjs/common';
import { SearchHealthFacilityDto } from './dto/search-health-facility.dto';
import { HealthFacilityService } from './health-facility.service';

@Controller('health-facility')
export class HealthFacilityController {
  constructor(private healthFacilityService: HealthFacilityService) {}
  @Get('')
  public searchClient(@Query() query: SearchHealthFacilityDto) {
    return this.healthFacilityService.find(query);
  }
}
