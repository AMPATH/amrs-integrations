import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClaimProviderStateTransitionEntity } from '../../../core/database/entities/claim-provider-state-transition.entity';
import { Repository } from 'typeorm';
import { ClaimProviderStateTransitionDto } from './dto/claims-provider-state-transition.dto';
import { ClaimsVisitService } from '../../../claims/claims-eligibility/visit/visit.service';
import { QueryClaimVisitDto } from '../../../claims/claims-eligibility/visit/dto/query-claim-visit.dto';
import { UpdateClaimVisitDto } from '../../../claims/claims-eligibility/visit/dto/update-claim-visit.dto';

@Injectable()
export class ClaimsProviderStateTransitionService {
  constructor(
    @InjectRepository(ClaimProviderStateTransitionEntity)
    private readonly claimProviderStateTransitionEntityRepository: Repository<ClaimProviderStateTransitionEntity>,
    private readonly visitService: ClaimsVisitService,
  ) {}
  async createClaimProviderPreview(
    claimProviderStateTransitionDto: ClaimProviderStateTransitionDto,
  ) {
    try {
      const entity = this.claimProviderStateTransitionEntityRepository.create({
        ...claimProviderStateTransitionDto,
      });

      const res =
        await this.claimProviderStateTransitionEntityRepository.save(entity);
      const queryClaimBy: QueryClaimVisitDto = {
        authorizationCode: res.consent_token,
      };
      const updateClaimVisitDto: UpdateClaimVisitDto = {
        providerStatus: res.to_state,
      };
      return await this.visitService.updateVisit(
        queryClaimBy,
        updateClaimVisitDto,
      );
    } catch (err) {
      console.log(err);
      return err;
    }
  }
}
