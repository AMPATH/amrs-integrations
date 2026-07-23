import { Module } from '@nestjs/common';
import { HieHttpRequestModule } from '../hie-http-request/hie-http-request.module';
import { SubBenefitsController } from './claims-eligibility/sub-benefits/sub-benefits.controller';
import { SubBenefitsService } from './claims-eligibility/sub-benefits/sub-benefits.service';
import { InterventionsController } from './claims-eligibility/interventions/interventions.controller';
import { InterventionsService } from './claims-eligibility/interventions/interventions.service';
import { BenefitsUtilizationController } from './claims-eligibility/benefit-utilization/benefits-utilization.controller';
import { BenefitsUtilizationService } from './claims-eligibility/benefit-utilization/benefits-utilization.service';
import { BedOccupancyController } from './claims-eligibility/bed-occupancy/bed-occupancy.controller';
import { BedOccupancyService } from './claims-eligibility/bed-occupancy/bed-occupancy.service';
import { LocationFacilityHelper } from '../shared/utils/location-facility.helper';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacilityLocation } from '../core/database/entities/facility-locations.entity';
import { BillOrderController } from './claims-eligibility/bill-order/bill-order.controller';
import { BillOrderService } from './claims-eligibility/bill-order/bill-order.service';
import { BillOrder } from '../core/database/entities/bill-order.entity';
import { ClaimsVisitController } from './claims-eligibility/visit/visit.controller';
import { ClaimsVisitService } from './claims-eligibility/visit/visit.service';
import { ClaimsOtpController } from './claims-eligibility/otp/claims-otp.controller';
import { ClaimsOtpService } from './claims-eligibility/otp/claims-otp.service';
import { ClaimLineController } from './claims-eligibility/claim-line/claim-line.controller';
import { ClaimLineService } from './claims-eligibility/claim-line/claim-line.service';
import { ClaimDiagnosisController } from './claims-eligibility/claim-diagnosis/claim-diagnosis.controller';
import { ClaimDiagnosisService } from './claims-eligibility/claim-diagnosis/claim-diagnosis.service';
import { ClaimAttachmentController } from './claims-eligibility/claim-attachment/claim-attachment.controller';
import { ClaimAttachmentService } from './claims-eligibility/claim-attachment/claim-attachment.service';
import { ClaimPreviewController } from './claims-eligibility/claim-preview/claim-preview.controller';
import { ClaimPreviewService } from './claims-eligibility/claim-preview/claim-preview.service';
import { ClaimResubmissionController } from './claims-eligibility/claim-resubmission/claim-resubmission.controller';
import { ClaimResubmissionService } from './claims-eligibility/claim-resubmission/claim-resubmission.service';
import { CombinedBillingController } from './claims-eligibility/combined-billing/combined-billing.controller';
import { CombinedBillingService } from './claims-eligibility/combined-billing/combined-billing.service';
import { ClaimSubmissionController } from './claims-eligibility/claim-submission/claim-submission.controller';
import { ClaimSubmissionService } from './claims-eligibility/claim-submission/claim-submission.service';
import { ClaimVisit } from '../core/database/entities/claim-visit.entity';
import { ClaimIntervention } from '../core/database/entities/claim-intervention.entity';
import { ClaimDiagnosis } from '../core/database/entities/claim-diagnosis.entity';
import { ClaimClosureService } from './claims-eligibility/claim-closure/claim-closure.service';
import { ClaimClosureController } from './claims-eligibility/claim-closure/claim-closure.controller';
import { ClaimLine } from '../core/database/entities/claime-line.entity';
import { OtpDischargeService } from 'src/consent/otp-discharge/otp-discharge.service';
import { ClaimDischargeController } from './claims-eligibility/claim-discharge/claim-discharge.controller';
import { ClaimDischargeService } from './claims-eligibility/claim-discharge/claim-discharge.service';
import { ClaimAttachment } from '../core/database/entities/claim-attachment.entity';
import { ClaimAuthorizationService } from './claims-eligibility/claim-authorization/claim-authorization.service';
import { ClaimAuthorizationController } from './claims-eligibility/claim-authorization/claim-authorization.controller';
import { PreAuthService } from './claims-eligibility/pre-auth/pre-auth.service';
import { PreAuthController } from './claims-eligibility/pre-auth/pre-auth.controller';
import { PomsfBalanceController } from './claims-eligibility/pomsf-balance/pomsf-balance.controller';
import { PomsfBalanceService } from './claims-eligibility/pomsf-balance/pomsf-balance.service';

@Module({
  imports: [
    HieHttpRequestModule,
    TypeOrmModule.forFeature([
      FacilityLocation,
      BillOrder,
      ClaimVisit,
      ClaimIntervention,
      ClaimDiagnosis,
      ClaimLine,
      ClaimAttachment,
    ]),
  ],
  controllers: [
    SubBenefitsController,
    InterventionsController,
    BenefitsUtilizationController,
    BedOccupancyController,
    BillOrderController,
    ClaimsVisitController,
    ClaimsOtpController,
    ClaimLineController,
    ClaimDiagnosisController,
    ClaimAttachmentController,
    ClaimPreviewController,
    ClaimResubmissionController,
    CombinedBillingController,
    ClaimSubmissionController,
    ClaimClosureController,
    ClaimDischargeController,
    ClaimAuthorizationController,
    PreAuthController,
    PomsfBalanceController
  ],
  providers: [
    SubBenefitsService,
    InterventionsService,
    BenefitsUtilizationService,
    BedOccupancyService,
    LocationFacilityHelper,
    BillOrderService,
    ClaimsVisitService,
    ClaimsOtpService,
    ClaimLineService,
    ClaimDiagnosisService,
    ClaimAttachmentService,
    ClaimPreviewService,
    ClaimResubmissionService,
    CombinedBillingService,
    ClaimSubmissionService,
    ClaimClosureService,
    OtpDischargeService,
    ClaimDischargeService,
    ClaimAuthorizationService,
    PreAuthService,
    PomsfBalanceService
  ],
})
export class ClaimsModule {}
