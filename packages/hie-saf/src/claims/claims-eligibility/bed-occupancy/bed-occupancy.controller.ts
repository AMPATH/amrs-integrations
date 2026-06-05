import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { BedOccupancyService } from './bed-occupancy.service';
import { BedOccupancyDto } from './dto/bed-occupancy.dto';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';

@UseGuards(OpenMrsAuthGuard)
@Controller('bed-occupancy')
export class BedOccupancyController {
  constructor(private readonly bedOccupancyService: BedOccupancyService) {}
  @Get()
  fetchFacilityBedOccupancy(@Query() query: BedOccupancyDto) {
    return this.bedOccupancyService.fetchBedOccupancy(query);
  }
}
