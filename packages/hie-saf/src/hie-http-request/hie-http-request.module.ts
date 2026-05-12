import { Module } from '@nestjs/common';
import { HieHttpRequests } from './hie-http-requests';
import { HieAuthService } from '../auth/hie-auth/hie-auth.service';

@Module({
  providers: [HieAuthService, HieHttpRequests],
  exports: [HieHttpRequests],
})
export class HieHttpRequestModule {}
