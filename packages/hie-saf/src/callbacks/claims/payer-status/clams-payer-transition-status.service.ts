import { Injectable } from '@nestjs/common';
import { ClaimPayerStateTransitionDto } from './dto/claims-payer-transition-status.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClaimsVisitService } from '../../../claims/claims-eligibility/visit/visit.service';
import { ClaimPayerStateTransitionEntity } from '../../../core/database/entities/claim-payer-preview-state-transition.entity';
import { QueryClaimVisitDto } from '../../../claims/claims-eligibility/visit/dto/query-claim-visit.dto';
import { UpdateClaimVisitDto } from '../../../claims/claims-eligibility/visit/dto/update-claim-visit.dto';

@Injectable()
export class ClaimsPayerStatusService {
  constructor(
    @InjectRepository(ClaimPayerStateTransitionEntity)
    private readonly claimPayerStateTransitionEntityRepository: Repository<ClaimPayerStateTransitionEntity>,
    private readonly visitService: ClaimsVisitService,
  ) {}

  async createClaimPayerPreview(
    claimsPayerStateTransitionDto: ClaimPayerStateTransitionDto,
  ) {
    try {
      const entity = this.claimPayerStateTransitionEntityRepository.create({
        ...claimsPayerStateTransitionDto,
      });

      const res =
        await this.claimPayerStateTransitionEntityRepository.save(entity);

      const queryClaimBy: QueryClaimVisitDto = {
        authorizationCode: res.consent_token,
      };
      const updateClaimVisitDto: UpdateClaimVisitDto = {
        payerStatus: res.to_state,
      };

      const res2 = await this.visitService.updateVisit(
        queryClaimBy,
        updateClaimVisitDto,
      );

      return res2;
    } catch (err) {
      return err;
    }
  }
}
