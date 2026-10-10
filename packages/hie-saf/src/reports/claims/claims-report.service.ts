import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClaimVisit } from '../../core/database/entities/claim-visit.entity';
import { Between, Repository } from 'typeorm';
import { ClaimsSummaryDto } from './dto/claims-summary.dto';
import { ClaimsSummaryListDto } from './dto/claims-summary-list.dto';

@Injectable()
export class ClaimsReportService {
  constructor(
    @InjectRepository(ClaimVisit)
    private claimVisitRepository: Repository<ClaimVisit>,
  ) {}
  public async generateClaimsSummaryReport(claimSummaryDto: ClaimsSummaryDto) {
    const startDate = claimSummaryDto.startDate;
    const endDate = claimSummaryDto.endDate;
    const locationUuid = claimSummaryDto.locationUuid;
    try {
      const results = await this.claimVisitRepository
        .createQueryBuilder('cv')
        .select('cv.provider_status', 'provider_status')
        .addSelect('cv.payer_status', 'payer_status')
        .addSelect('COUNT(*)', 'total')
        .addSelect('SUM(cv.total_claim_amount)', 'total_claim_amount')
        .where('cv.visit_start >= :startDate', { startDate })
        .andWhere('cv.visit_start <= :endDate', { endDate })
        .andWhere('cv.location_uuid = :locationUuid', { locationUuid })
        .groupBy('cv.provider_status')
        .addGroupBy('cv.payer_status')
        .getRawMany();

      return results;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error getting claims summary',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  public async generateClaimsSummaryList(
    claimsSummaryListDto: ClaimsSummaryListDto,
  ) {
    const queryBy = {
      locationUuid: claimsSummaryListDto.locationUuid,
    };
    if (claimsSummaryListDto.providerStatus) {
      queryBy['providerStatus'] = claimsSummaryListDto.providerStatus;
    }
    if (claimsSummaryListDto.payerStatus) {
      queryBy['payerStatus'] = claimsSummaryListDto.payerStatus;
    }
    try {
      const visits = await this.claimVisitRepository.find({
        select: {
          locationUuid: true,
          visitStart: true,
          patientId: true,
          invoiceNo: true,
          serviceType: true,
          authorizationCode: true,
          providerStatus: true,
          payerStatus: true,
          totalClaimAmount: true,
        },
        where: {
          ...queryBy,
          visitStart: Between(
            new Date(claimsSummaryListDto.startDate),
            new Date(`${claimsSummaryListDto.endDate} 23:59:59`),
          ),
        },
      });
      return visits;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error getting claims summary list',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
