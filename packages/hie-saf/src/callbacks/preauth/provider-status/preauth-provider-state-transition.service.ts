import { Injectable } from '@nestjs/common';
import { PreauthProviderStateTransitionDto } from './dto/preauth-provider-state-transition.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { PreauthProviderStateTransitionEntity } from 'src/core/database/entities/preauth-provider-state-transition.entity';
import { Repository } from 'typeorm';

@Injectable()
export class PreauthProviderStateTransitionService {
  constructor(
    @InjectRepository(PreauthProviderStateTransitionEntity)
    private readonly preauthProviderStateTransitionEntityRepository: Repository<PreauthProviderStateTransitionEntity>,
  ) {}
  async createPreauthProviderStateTransition(
    preauthProviderStateTransitionDto: PreauthProviderStateTransitionDto,
  ) {
    console.log('DTO: ', preauthProviderStateTransitionDto);
    const entity = this.preauthProviderStateTransitionEntityRepository.create({
      ...preauthProviderStateTransitionDto,
    });

    return this.preauthProviderStateTransitionEntityRepository.save(entity);
  }
}
