import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FacilityLocation } from '../../core/database/entities/facility-locations.entity';
import { Repository } from 'typeorm';

@Injectable()
export class LocationFacilityHelper {
  constructor(
    @InjectRepository(FacilityLocation)
    private facilityLocationRepository: Repository<FacilityLocation>,
  ) {}

  public getFacilityUsingLocationUuid(locationUuid: string) {
    return this.facilityLocationRepository.findOneBy({
      location_uuid: locationUuid,
    });
  }
}
