import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacilityLocation } from '../core/database/entities/facility-locations.entity';
import { HwrSync } from '../core/database/entities/hwr_sync.entity';
import { ShrConsentSession } from '../core/database/entities/shr-consent-session.entity';
import { HealthWorkerRegistryModule } from '../health-worker-registry/health-worker-registry.module';
import { HealthWorkerRegistryService } from '../health-worker-registry/health-worker-registry.service';
import { HieHttpRequestModule } from '../hie-http-request/hie-http-request.module';
import { LocationFacilityHelper } from '../shared/utils/location-facility.helper';
import { ShrConsentSessionStore } from './shr-consent-session.store';
import { ShrController } from './shr.controller';
import { ShrService } from './shr.service';
import { PractitionerResolver } from '../shared/utils/practitioner-resolver.helper';

@Module({
  imports: [
    HieHttpRequestModule,
    HealthWorkerRegistryModule,
    TypeOrmModule.forFeature([FacilityLocation, HwrSync, ShrConsentSession]),
  ],
  controllers: [ShrController],
  providers: [
    ShrService,
    ShrConsentSessionStore,
    LocationFacilityHelper,
    PractitionerResolver,
    HealthWorkerRegistryService,
  ],
})
export class ShrModule {}
