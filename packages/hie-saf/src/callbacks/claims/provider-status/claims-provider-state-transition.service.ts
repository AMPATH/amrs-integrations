import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClaimProviderStateTransitionEntity } from 'src/core/database/entities/claim-provider-state-transition.entity';
import { Repository } from 'typeorm';
import { ClaimProviderStateTransitionDto } from './dto/claims-provider-state-transition.dto';
import { ClaimsVisitService } from 'src/claims/claims-eligibility/visit/visit.service';

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

      await this.claimProviderStateTransitionEntityRepository.save(entity);
      return await this.visitService.updateVisitClaimStatus(
        claimProviderStateTransitionDto.to_state,
        claimProviderStateTransitionDto.consent_token,
      );
    } catch (err) {
      console.log(err);
      return err;
    }
  }
}
