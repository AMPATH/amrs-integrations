import { Module } from '@nestjs/common';
import { ConsentService } from './consent.service';
import { HieHttpRequestModule } from '../hie-http-request/hie-http-request.module';

@Module({
  imports: [HieHttpRequestModule],
  providers: [ConsentService],
  exports: [ConsentService],
})
export class ConsentModule {}
