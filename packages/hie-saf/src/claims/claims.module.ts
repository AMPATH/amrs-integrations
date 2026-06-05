import { Module } from '@nestjs/common';
import { HieHttpRequestModule } from '../hie-http-request/hie-http-request.module';
import { SubBenefitsController } from './claims-eligibility/sub-benefits/sub-benefits.controller';
import { SubBenefitsService } from './claims-eligibility/sub-benefits/sub-benefits.service';

@Module({
  imports: [HieHttpRequestModule],
  controllers: [SubBenefitsController],
  providers: [SubBenefitsService],
})
export class ClaimsModule {}
