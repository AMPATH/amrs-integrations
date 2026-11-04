import { Injectable, Logger } from '@nestjs/common';

import { SearchHealthFacilityDto } from './dto/search-health-facility.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { HealthFacility } from '../core/database/entities/health-facility.entity';
import { Like, Repository } from 'typeorm';

@Injectable()
export class HealthFacilityService {
  constructor(
    @InjectRepository(HealthFacility)
    private readonly healthFacilityRepository: Repository<HealthFacility>,
  ) {}
  async find(searchHealthFacilityDto: SearchHealthFacilityDto) {
    try {
      const resp = await this.healthFacilityRepository.find({
        where: {
          officialName: Like(`%${searchHealthFacilityDto.q}%`),
        },
      });
      const transformedResults = this.transformHealthFacilityData(resp);
      return transformedResults;
    } catch (error) {
      Logger.error('Error fetching health facility', error);
      return [];
    }
  }
  private transformHealthFacilityData(healthFacilities: HealthFacility[]) {
    return healthFacilities.map((h) => {
      return {
        ...h,
        display: `${h.officialName} (${h.county}) (${h.registrationNumber}) (${h.kephLevel})`,
      };
    });
  }
}
