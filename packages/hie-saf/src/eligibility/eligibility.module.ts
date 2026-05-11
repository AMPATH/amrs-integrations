import { Module } from '@nestjs/common';
import { EligibilityService } from './eligibility.service';
import { EligibilityController } from './eligibility.controller';
import { IdentifierTypeHelper } from '../shared/utils/identifier-type';
import { HieHttpRequestModule } from 'src/hie-http-request/hie-http-request.module';

@Module({
  imports: [HieHttpRequestModule],
  providers: [EligibilityService, IdentifierTypeHelper],
  controllers: [EligibilityController],
})
export class EligibilityModule {}
