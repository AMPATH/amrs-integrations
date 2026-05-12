import { Module } from '@nestjs/common';
import { ClientRegistryController } from './client-registry.controller';
import { ClientRegistryService } from './client-registry.service';
import { HieHttpRequestModule } from '../hie-http-request/hie-http-request.module';
import { ConsentModule } from '../consent/consent.module';

@Module({
  imports: [HieHttpRequestModule, ConsentModule],
  controllers: [ClientRegistryController],
  providers: [ClientRegistryService],
})
export class ClientRegistryModule {}
