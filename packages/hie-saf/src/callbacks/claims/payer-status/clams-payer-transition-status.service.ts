import { Injectable } from '@nestjs/common';
import { ClaimPayerStateTransitionDto } from './dto/claims-payer-transition-status.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClaimsVisitService } from 'src/claims/claims-eligibility/visit/visit.service';
import { ClaimPayerStateTransitionEntity } from 'src/core/database/entities/claim-payer-preview-state-transition.entity';

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
      console.log('DTO: ', claimsPayerStateTransitionDto);
      const entity = this.claimPayerStateTransitionEntityRepository.create({
        ...claimsPayerStateTransitionDto,
      });

      console.log('ENTITY: ', entity);

      const res =
        await this.claimPayerStateTransitionEntityRepository.save(entity);

      console.log('RES: ', res);

      const res2 = await this.visitService.updateVisitClaimStatus(
        res.to_state,
        res.consent_token,
      );

      console.log('RES2: ', res2);
      return res2;
    } catch (err) {
      return err;
    }
  }
}
