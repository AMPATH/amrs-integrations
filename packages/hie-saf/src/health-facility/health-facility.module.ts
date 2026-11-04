import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthFacility } from '../core/database/entities/health-facility.entity';
import { HealthFacilityController } from './health-facility.controller';
import { HealthFacilityService } from './health-facility.service';

@Module({
  imports: [TypeOrmModule.forFeature([HealthFacility])],
  controllers: [HealthFacilityController],
  providers: [HealthFacilityService],
})
export class HealthFacilityModule {}
