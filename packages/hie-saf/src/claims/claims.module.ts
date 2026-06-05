import { Module } from '@nestjs/common';
import { HieHttpRequestModule } from '../hie-http-request/hie-http-request.module';
import { SubBenefitsController } from './claims-eligibility/sub-benefits/sub-benefits.controller';
import { SubBenefitsService } from './claims-eligibility/sub-benefits/sub-benefits.service';
import { InterventionsController } from './claims-eligibility/interventions/interventions.controller';
import { InterventionsService } from './claims-eligibility/interventions/interventions.service';

@Module({
  imports: [HieHttpRequestModule],
  controllers: [SubBenefitsController, InterventionsController],
  providers: [SubBenefitsService, InterventionsService],
})
export class ClaimsModule {}
