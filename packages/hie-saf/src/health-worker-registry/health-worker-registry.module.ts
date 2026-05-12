import { Module } from '@nestjs/common';
import { HealthWorkerRegistryService } from './health-worker-registry.service';
import { HealthWorkerRegistryController } from './health-worker-registry.controller';
import { HieHttpRequestModule } from 'src/hie-http-request/hie-http-request.module';

@Module({
  imports: [HieHttpRequestModule],
  providers: [HealthWorkerRegistryService],
  controllers: [HealthWorkerRegistryController],
})
export class HealthWorkerRegistryModule {}
