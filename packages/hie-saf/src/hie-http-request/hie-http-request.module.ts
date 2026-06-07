import { Module } from '@nestjs/common';
import { HieHttpRequests } from './hie-http-requests';
import { HieAuthService } from '../auth/hie-auth/hie-auth.service';
import { LocationFacilityHelper } from '../shared/utils/location-facility.helper';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacilityLocation } from '../core/database/entities/facility-locations.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FacilityLocation])],
  providers: [HieAuthService, HieHttpRequests, LocationFacilityHelper],
  exports: [HieHttpRequests],
})
export class HieHttpRequestModule {}
