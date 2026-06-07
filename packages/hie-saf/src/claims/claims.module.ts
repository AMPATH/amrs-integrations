import { Module } from '@nestjs/common';
import { HieHttpRequestModule } from '../hie-http-request/hie-http-request.module';
import { SubBenefitsController } from './claims-eligibility/sub-benefits/sub-benefits.controller';
import { SubBenefitsService } from './claims-eligibility/sub-benefits/sub-benefits.service';
import { InterventionsController } from './claims-eligibility/interventions/interventions.controller';
import { InterventionsService } from './claims-eligibility/interventions/interventions.service';
import { BenefitsUtilizationController } from './claims-eligibility/benefit-utilization/benefits-utilization.controller';
import { BenefitsUtilizationService } from './claims-eligibility/benefit-utilization/benefits-utilization.service';
import { BedOccupancyController } from './claims-eligibility/bed-occupancy/bed-occupancy.controller';
import { BedOccupancyService } from './claims-eligibility/bed-occupancy/bed-occupancy.service';
import { LocationFacilityHelper } from '../shared/utils/location-facility.helper';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacilityLocation } from '../core/database/entities/facility-locations.entity';

@Module({
  imports: [HieHttpRequestModule, TypeOrmModule.forFeature([FacilityLocation])],
  controllers: [
    SubBenefitsController,
    InterventionsController,
    BenefitsUtilizationController,
    BedOccupancyController,
  ],
  providers: [
    SubBenefitsService,
    InterventionsService,
    BenefitsUtilizationService,
    BedOccupancyService,
    LocationFacilityHelper,
  ],
})
export class ClaimsModule {}
