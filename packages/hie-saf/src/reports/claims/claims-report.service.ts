import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClaimVisit } from '../../core/database/entities/claim-visit.entity';
import { Repository } from 'typeorm';
import { ClaimsSummaryDto } from './dto/claims-summary.dto';

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
}
