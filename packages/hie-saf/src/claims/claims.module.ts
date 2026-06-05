import { Module } from '@nestjs/common';
import { HieHttpRequestModule } from '../hie-http-request/hie-http-request.module';
import { SubBenefitsController } from './claims-eligibility/sub-benefits/sub-benefits.controller';
import { SubBenefitsService } from './claims-eligibility/sub-benefits/sub-benefits.service';
import { InterventionsController } from './claims-eligibility/interventions/interventions.controller';
import { InterventionsService } from './claims-eligibility/interventions/interventions.service';
import { BenefitsUtilizationController } from './claims-eligibility/benefit-utilization/benefits-utilization.controller';
import { BenefitsUtilizationService } from './claims-eligibility/benefit-utilization/benefits-utilization.service';

@Module({
  imports: [HieHttpRequestModule],
  controllers: [
    SubBenefitsController,
    InterventionsController,
    BenefitsUtilizationController,
  ],
  providers: [
    SubBenefitsService,
    InterventionsService,
    BenefitsUtilizationService,
  ],
})
export class ClaimsModule {}
