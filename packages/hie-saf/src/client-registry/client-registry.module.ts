import { Module } from '@nestjs/common';
import { ClientRegistryController } from './client-registry.controller';
import { ClientRegistryService } from './client-registry.service';
import { HieHttpRequestModule } from 'src/hie-http-request/hie-http-request.module';

@Module({
  imports: [HieHttpRequestModule],
  controllers: [ClientRegistryController],
  providers: [ClientRegistryService],
})
export class ClientRegistryModule {}
