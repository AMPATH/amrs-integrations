import { Module } from '@nestjs/common';
import { FacilityRegistryController } from './facility-registry.controller';
import { FacilityRegistryService } from './facility-registry.service';
import { FacilityIdentifierTypeHelper } from 'src/shared/utils/facility-identifier-type';
import { HieHttpRequestModule } from 'src/hie-http-request/hie-http-request.module';

@Module({
  imports: [HieHttpRequestModule],
  controllers: [FacilityRegistryController],
  providers: [FacilityRegistryService, FacilityIdentifierTypeHelper],
})
export class FacilityRegistryModule {}
