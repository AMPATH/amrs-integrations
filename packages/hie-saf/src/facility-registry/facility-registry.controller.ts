import { Controller, Get, Query } from '@nestjs/common';
import { SearchFacilityParamsDto } from './dto/search-facility-params.dto';
import { FacilityRegistryService } from './facility-registry.service';
import { FacilityIdentifierTypeHelper } from 'src/shared/utils/facility-identifier-type';
import { FetchFacilityDto } from './dto/fetch-facility.dto';

@Controller('facility')
export class FacilityRegistryController {
  constructor(
    private readonly facilityRegistryService: FacilityRegistryService,
    private readonly facilityIdentifierTypeHelper: FacilityIdentifierTypeHelper,
  ) {}
  @Get('search')
  public findFacility(@Query() query: SearchFacilityParamsDto) {
    const facilityIdentifierType =
      this.facilityIdentifierTypeHelper.getIdentifierByFilterType(
        query.filterType,
      ) ?? '';
    const facilityFetchDto: FetchFacilityDto = {
      'identifier-type': facilityIdentifierType,
      identifier: query.filterValue,
    };
    return this.facilityRegistryService.fetchFacilityFromClientRegistry(
      facilityFetchDto,
    );
  }
}
