import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HieHttpRequestModule } from 'src/hie-http-request/hie-http-request.module';
import { ClaimSyncService } from './claim-sync.service';
import { ClaimSyncController } from './claim-sync.controller';
import { ClaimVisit } from '../core/database/entities/claim-visit.entity';
import { ClaimPreviewService } from '../claims/claims-eligibility/claim-preview/claim-preview.service';
import { ClaimsVisitService } from '../claims/claims-eligibility/visit/visit.service';

@Module({
  imports: [TypeOrmModule.forFeature([ClaimVisit]), HieHttpRequestModule],
  providers: [ClaimSyncService, ClaimPreviewService, ClaimsVisitService],
  controllers: [ClaimSyncController],
})
export class ClaimSyncModule {}
