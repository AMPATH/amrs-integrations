import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { HealthWorkerRegistryService } from './health-worker-registry.service';
import { SearchHealthWorkerParamsDto } from './dto/search-health-worker.dto';
import { FetchHealthWorkerDto } from './dto/fetch-health-worker.dto';
import { Regulators } from './types';
import { OpenMrsAuthGuard } from '../auth/guards/openmrs-auth-guard/openmrs-auth.guard';

@UseGuards(OpenMrsAuthGuard)
@Controller('practitioner')
export class HealthWorkerRegistryController {
  constructor(private readonly hwrService: HealthWorkerRegistryService) {}
  @Get('search')
  findOne(@Query() query: SearchHealthWorkerParamsDto) {
    const fetchHealthWorkerDto: FetchHealthWorkerDto = {
      identifierNumber: query.identifierValue,
      identifierType: query.identifierType,
      regulator: Regulators.Kmpdc,
    };
    return this.hwrService.fetchFacilityFromClientRegistry(
      fetchHealthWorkerDto,
    );
  }
}
