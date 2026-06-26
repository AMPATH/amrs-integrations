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

@Module({
  imports: [
    HieHttpRequestModule,
    TypeOrmModule.forFeature([FacilityLocation, BillOrder]),
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
  ],
})
export class ClaimsModule {}
