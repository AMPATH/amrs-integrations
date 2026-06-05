import { Controller, Get, Query } from '@nestjs/common';
import { BedOccupancyService } from './bed-occupancy.service';
import { BedOccupancyDto } from './dto/bed-occupancy.dto';

@Controller('bed-occupancy')
export class BedOccupancyController {
  constructor(private readonly bedOccupancyService: BedOccupancyService) {}
  @Get()
  fetchFacilityBedOccupancy(@Query() query: BedOccupancyDto) {
    return this.bedOccupancyService.fetchBedOccupancy(query);
  }
}
