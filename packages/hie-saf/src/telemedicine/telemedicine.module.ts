import { Module } from '@nestjs/common';
import { LocationFacilityHelper } from '../shared/utils/location-facility.helper';
import { TelemedicineController } from './telemedicine.controller';
import { TelemedicineService } from './telemedicine.service';

@Module({
  controllers: [TelemedicineController],
  providers: [TelemedicineService, LocationFacilityHelper],
})
export class TelemedicineModule {}
