import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HwrSync } from '../core/database/entities/hwr_sync.entity';
import { HealthWorkerRegistryModule } from '../health-worker-registry/health-worker-registry.module';
import { HealthWorkerRegistryService } from '../health-worker-registry/health-worker-registry.service';
import { HieHttpRequestModule } from '../hie-http-request/hie-http-request.module';
import { PractitionerResolver } from '../shared/utils/practitioner-resolver.helper';
import { EmtController } from './emt.controller';
import { EmtService } from './emt.service';

@Module({
  imports: [
    HieHttpRequestModule,
    HealthWorkerRegistryModule,
    TypeOrmModule.forFeature([HwrSync]),
  ],
  controllers: [EmtController],
  providers: [EmtService, PractitionerResolver, HealthWorkerRegistryService],
})
export class EmtModule {}
