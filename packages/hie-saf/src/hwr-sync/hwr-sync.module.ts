import { Module } from '@nestjs/common';
import { HwrSyncController } from './hwr-sync.controller';
import { HwrSyncService } from './hwr-sync.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HwrSync } from '../core/database/entities/hwr_sync.entity';
import { HealthWorkerRegistryService } from '../health-worker-registry/health-worker-registry.service';
import { HieHttpRequestModule } from '../hie-http-request/hie-http-request.module';

@Module({
  imports: [TypeOrmModule.forFeature([HwrSync]), HieHttpRequestModule],
  providers: [HwrSyncService, HealthWorkerRegistryService],
  controllers: [HwrSyncController],
})
export class HwrSyncModule {}
