import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RegistrationBillableService } from '../core/database/entities/registration-billable-services.entity';
import { SearchRegistrationBillableServiceDto } from './dto/search-registration-billable-service.dto';
import { CreateRegistrationBillableServiceDto } from './dto/create-registration-billable-service.dto';

@Injectable()
export class RegistrationBillableServiceService {
  constructor(
    @InjectRepository(RegistrationBillableService)
    private readonly registrationBillableServiceRepository: Repository<RegistrationBillableService>,
  ) {}
  async find(
    searchRegistrationBillableServiceDto: SearchRegistrationBillableServiceDto,
  ) {
    try {
      const resp = await this.registrationBillableServiceRepository.find({
        where: {
          locationUuid: searchRegistrationBillableServiceDto.locationUuid,
        },
      });

      return resp;
    } catch (error) {
      Logger.error('Error fetching registration billable services', error);
      return [];
    }
  }
  async create(
    registrationBillableServiceDto: CreateRegistrationBillableServiceDto,
  ) {
    const registrationBillableServiceEntity =
      this.registrationBillableServiceRepository.create({
        billableServiceName: registrationBillableServiceDto.billableServiceName,
        locationUuid: registrationBillableServiceDto.locationUuid,
        billableServiceUuid: registrationBillableServiceDto.billableServiceUuid,
      });
    await this.registrationBillableServiceRepository.save(
      registrationBillableServiceEntity,
    );
  }
}
