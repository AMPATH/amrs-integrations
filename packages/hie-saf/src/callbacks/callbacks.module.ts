import { Module } from '@nestjs/common';
import { ClaimsProviderStatusController } from './claims/provider-status/claims-provider-state-transition.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClaimProviderStateTransitionEntity } from 'src/core/database/entities/claim-provider-state-transition.entity';
import { ClaimPayerStateTransitionEntity } from 'src/core/database/entities/claim-payer-preview-state-transition.entity';
import { PreauthProviderStateTransitionEntity } from 'src/core/database/entities/preauth-provider-state-transition.entity';
import { ClaimsProviderStateTransitionService } from './claims/provider-status/claims-provider-state-transition.service';
import { ClaimsVisitService } from 'src/claims/claims-eligibility/visit/visit.service';
import { HieHttpRequestModule } from 'src/hie-http-request/hie-http-request.module';
import { ClaimVisit } from 'src/core/database/entities/claim-visit.entity';
import { ClaimsPayerStatusController } from './claims/payer-status/claims-payer-transition-status.controller';
import { ClaimsPayerStatusService } from './claims/payer-status/clams-payer-transition-status.service';
import { PreauthProviderStateTransitionService } from './preauth/provider-status/preauth-provider-state-transition.service';
import { PreauthProviderStateTransitionController } from './preauth/provider-status/preauth-provider-state-transition.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClaimProviderStateTransitionEntity,
      ClaimPayerStateTransitionEntity,
      PreauthProviderStateTransitionEntity,
      ClaimVisit,
    ]),
    HieHttpRequestModule,
  ],
  controllers: [
    ClaimsProviderStatusController,
    ClaimsPayerStatusController,
    PreauthProviderStateTransitionController,
  ],
  providers: [
    ClaimsProviderStateTransitionService,
    ClaimsVisitService,
    ClaimsPayerStatusService,
    PreauthProviderStateTransitionService,
  ],
})
export class CallbackModule {}
