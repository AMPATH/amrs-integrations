import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClaimVisit } from '../core/database/entities/claim-visit.entity';
import { Between, In, IsNull, Not, Repository } from 'typeorm';
import { ClaimsBatchSync } from './types';
import { ClaimPreviewService } from '../claims/claims-eligibility/claim-preview/claim-preview.service';
import {
  PreviewPayerClaimDto,
  PreviewProviderClaimDto,
} from '../claims/claims-eligibility/claim-preview/types';
import { ClaimsBatchSyncDto } from './dto/claims-batch-sync.dto';

@Injectable()
export class ClaimSyncService {
  constructor(
    @InjectRepository(ClaimVisit)
    private readonly claimVisitRepository: Repository<ClaimVisit>,
    private readonly claimPreviewService: ClaimPreviewService,
  ) {}

  public async batchSyncClaims(claimsBatchSyncDto: ClaimsBatchSyncDto) {
    const startDate = new Date(`${claimsBatchSyncDto.startDate}T00:00:00`);
    const endDate = new Date(`${claimsBatchSyncDto.endDate}T00:00:00`);
    const claimsToSync = await this.claimVisitRepository.find({
      select: {
        patientId: true,
        visitStart: true,
        authorizationCode: true,
        invoiceNo: true,
        providerStatus: true,
        payerStatus: true,
      },
      where: [
        {
          providerStatus: Not(In(['DRAFT', 'CLOSED'])),
          payerStatus: Not('APPROVED'),
          visitStart: Between(startDate, endDate),
        },
        {
          providerStatus: Not(In(['DRAFT', 'CLOSED'])),
          payerStatus: IsNull(),
          visitStart: Between(startDate, endDate),
        },
      ],
    });
    Logger.log(`Claims to sync ...${claimsToSync.length}`);
    const results: any = [];
    for (let i = 0; i < claimsToSync.length - 1; i++) {
      const currentClaim = claimsToSync[i];
      const consentToken = currentClaim.authorizationCode;
      const invoiceNo = currentClaim.invoiceNo;
      const currentProviderStatus = currentClaim.providerStatus ?? '';
      const currentPayerStatus = currentClaim.payerStatus ?? '';
      const res = await this.syncClaim(
        consentToken,
        invoiceNo,
        currentClaim.locationUuid
          ? currentClaim.locationUuid
          : (claimsBatchSyncDto?.location_uuid ?? ''),
        currentProviderStatus,
        currentPayerStatus,
      );
      console.log(`${i} done...`);
      results.push(res);
    }
    return {
      claimsToSync: claimsToSync,
      syncResults: results,
    };
  }
  public async syncClaim(
    authorizationCode: string,
    invoiceNo: string,
    locationUuid: string,
    currentProviderStatus: string,
    currentPayerStatus: string,
  ) {
    const previewProviderClaimDto: PreviewProviderClaimDto = {
      consent_token: authorizationCode,
    };
    const previewPayerClaimDto: PreviewPayerClaimDto = {
      provider_claim_no: invoiceNo,
    };
    const syncStatus: string[] = [];
    try {
      const resp = await this.claimPreviewService.previewProviderClaim(
        previewProviderClaimDto,
        locationUuid,
      );
      const providerSyncStatus = `${authorizationCode} provider status updated...current status ${currentProviderStatus} new status ${resp.workflow_state}`;
      Logger.log(providerSyncStatus);
      const resp2 = await this.claimPreviewService.previewPayerClaim(
        previewPayerClaimDto,
        locationUuid,
      );
      syncStatus.push(providerSyncStatus);
      const payerSyncStatus = `${authorizationCode} payer status updated...current status ${currentPayerStatus} new status ${resp2.results ? resp2.results[0]?.workflowState : ''}`;
      Logger.log(payerSyncStatus);
      syncStatus.push(payerSyncStatus);
    } catch (error) {
      Logger.error(error);
    }
    return syncStatus;
  }
}
