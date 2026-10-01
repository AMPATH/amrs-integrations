import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacilityLocation } from '../core/database/entities/facility-locations.entity';
import { LocationFacilityHelper } from '../shared/utils/location-facility.helper';
import { TelemedicineController } from './telemedicine.controller';
import { TelemedicineService } from './telemedicine.service';

@Module({
  imports: [TypeOrmModule.forFeature([FacilityLocation])],
  controllers: [TelemedicineController],
  providers: [TelemedicineService, LocationFacilityHelper],
})
export class TelemedicineModule {}
