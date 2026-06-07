import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BedOccupancyService } from './bed-occupancy.service';
import { BedOccupancyDto } from './dto/bed-occupancy.dto';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { LocationFacilityHelper } from '../../../shared/utils/location-facility.helper';

@UseGuards(OpenMrsAuthGuard)
@Controller('bed-occupancy')
export class BedOccupancyController {
  constructor(
    private readonly bedOccupancyService: BedOccupancyService,
    private readonly locationFacilityHelper: LocationFacilityHelper,
  ) {}
  @Get()
  async fetchFacilityBedOccupancy(@Query() query: BedOccupancyDto) {
    const facility =
      await this.locationFacilityHelper.getFacilityUsingLocationUuid(
        query.locationUuid,
      );
    const facilityCode = facility?.frCode;
    if (!facilityCode) {
      throw new HttpException('Missing Facility Code', HttpStatus.BAD_REQUEST);
    }
    return this.bedOccupancyService.fetchBedOccupancy(
      facilityCode,
      query.locationUuid,
    );
  }
}
