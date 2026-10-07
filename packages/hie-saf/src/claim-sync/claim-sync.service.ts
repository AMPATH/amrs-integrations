import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClaimVisit } from '../core/database/entities/claim-visit.entity';
import { Between, In, IsNull, Not, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { ClaimPreviewService } from '../claims/claims-eligibility/claim-preview/claim-preview.service';
import {
  PreviewPayerClaimDto,
  PreviewProviderClaimDto,
} from '../claims/claims-eligibility/claim-preview/types';
import { ClaimsBatchSyncDto } from './dto/claims-batch-sync.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ClaimSyncService {
  private readonly logger = new Logger('ClaimSyncService');
  constructor(
    @InjectRepository(ClaimVisit)
    private readonly claimVisitRepository: Repository<ClaimVisit>,
    private readonly claimPreviewService: ClaimPreviewService,
    private readonly configService: ConfigService,
  ) {}

  public async batchSyncClaims(claimsBatchSyncDto: ClaimsBatchSyncDto) {
    Logger.log('batchSyncClaims...', claimsBatchSyncDto);
    const startDate = claimsBatchSyncDto.startDate;
    const endDate = claimsBatchSyncDto.endDate;
    const claimsToSync = await this.claimVisitRepository.find({
      select: {
        patientId: true,
        visitStart: true,
        authorizationCode: true,
        invoiceNo: true,
        providerStatus: true,
        payerStatus: true,
        locationUuid: true,
      },
      where: [
        {
          providerStatus: In(['FAILED_TO_SUBMIT', 'SUBMISSION_READY']),
          visitStart: Between(
            new Date(startDate),
            new Date(`${endDate} 23:59:59`),
          ),
        },
        {
          providerStatus: 'SUBMITTED',
          payerStatus: Not('APPROVED'),
          visitStart: Between(
            new Date(startDate),
            new Date(`${endDate} 23:59:59`),
          ),
        },
        {
          providerStatus: In(['SUBMITTED', 'SUBMISSION_READY']),
          payerStatus: IsNull(),
          visitStart: Between(
            new Date(startDate),
            new Date(`${endDate} 23:59:59`),
          ),
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
      if (currentClaim?.locationUuid) {
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
      } else {
        Logger.log('No location Uuid set');
      }
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

  @Cron('30 * * * *')
  public async syncClaimsCron() {
    const syncClaims = this.configService.get<boolean>('SYNC_CLAIMS') ?? false;
    Logger.log(`Should sync claims ${syncClaims}`);
    if (!syncClaims) {
      return;
    }
    this.logger.debug(`start claim sync job ${new Date().toISOString()}`);
    try {
      await this.batchSyncClaims({
        startDate: '2026-07-01',
        endDate: new Date().toISOString().split('T')[0],
      });
    } catch (error) {
      this.logger.error(error);
    }
    this.logger.debug(`end claim sync job ${new Date().toISOString()}`);
  }
}
