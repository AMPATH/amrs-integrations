import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import { InterventionsDto } from './dto/interventions.dto';
import {
  AddInterventionDto,
  Intervention,
  InterventionActions,
  InterventionsApiResponse,
  RestoreInterventionDto,
  RetireInterventionDto,
  SwitchInterventionsDto,
} from './types';
import { VisitIntervention } from '../visit/types';
import { InjectRepository } from '@nestjs/typeorm';
import { ClaimIntervention } from '../../../core/database/entities/claim-intervention.entity';
import { Repository } from 'typeorm';

@Injectable()
export class InterventionsService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
    @InjectRepository(ClaimIntervention)
    private claimInterventionRepository: Repository<ClaimIntervention>,
  ) {}
  async fetchInterventions(fetchInterventionsDto: InterventionsDto) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const interventionsUrl = `${baseUrl}/api/v1/patients/benefits/interventions?patient_id=${fetchInterventionsDto.patient_id}&sub_benefit_code=${fetchInterventionsDto.sub_benefit_code}`;
    try {
      const response = await this.hieHttpRequests.sendGetRequest(
        interventionsUrl,
        fetchInterventionsDto.locationUuid,
      );
      const data = (await response.json()) as InterventionsApiResponse;
      if ('error' in data) {
        Logger.error(data);
        return data;
      }
      return data.results;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error fetching interventions',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async addInterventions(
    addInterventionsDto: AddInterventionDto,
    locationUuid: string,
  ): Promise<VisitIntervention | Error> {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const addInterventionsUrl = `${baseUrl}/api/v1/claims/interventions`;
    try {
      const response = await this.hieHttpRequests.sendPostRequest(
        addInterventionsUrl,
        addInterventionsDto,
        locationUuid,
      );
      const data = (await response.json()) as VisitIntervention;

      if ('error' in data) {
        Logger.error(data);
        return data;
      }
      if (data) {
        try {
          const addInterventionEntity = this.claimInterventionRepository.create(
            {
              locationUuid: locationUuid,
              interventionAction: InterventionActions.Add,
              consentToken: addInterventionsDto.consent_token,
              interventionCode: addInterventionsDto.intervention_code,
              interventionResponse: data,
            },
          );
          await this.claimInterventionRepository.save(addInterventionEntity);
        } catch (error) {
          Logger.error(error);
        }
      }
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error Adding interventions',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async switchInterventions(
    switchInterventionsDto: SwitchInterventionsDto,
    locationUuid: string,
  ): Promise<VisitIntervention> {
    // do some validations
    if (switchInterventionsDto.retain_bill_items) {
      if (!switchInterventionsDto.bill_from) {
        throw new HttpException('Missing Bill from', HttpStatus.BAD_REQUEST);
      }
      if (!switchInterventionsDto.bill_to) {
        throw new HttpException('Missing Bill to', HttpStatus.BAD_REQUEST);
      }
    }
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const switchInterventionsUrl = `${baseUrl}/api/v1/claims/interventions/switch`;
    try {
      const response = await this.hieHttpRequests.sendPostRequest(
        switchInterventionsUrl,
        switchInterventionsDto,
        locationUuid,
      );
      const data = (await response.json()) as VisitIntervention;

      if ('error' in data) {
        Logger.error(data);
        return data;
      }
      if (data) {
        try {
          const switchInterventionEntity =
            this.claimInterventionRepository.create({
              locationUuid: locationUuid,
              interventionAction: InterventionActions.Switch,
              consentToken: switchInterventionsDto.consent_token,
              newInterventionCode: switchInterventionsDto.new_intervention_code,
              existingInterventionCode:
                switchInterventionsDto.existing_intervention_code,
              interventionResponse: data,
              retainBillItems: switchInterventionsDto.retain_bill_items,
              billFrom: switchInterventionsDto.bill_from,
              billTo: switchInterventionsDto.bill_to,
            });
          await this.claimInterventionRepository.save(switchInterventionEntity);
        } catch (error) {
          Logger.error(error);
        }
      }
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error switching interventions',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async restoreInterventions(
    restoreInterventionDto: RestoreInterventionDto,
    locationUuid: string,
  ): Promise<Intervention> {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const restoreInterventionsUrl = `${baseUrl}/api/v1/claims/interventions/restore`;
    try {
      const response = await this.hieHttpRequests.sendPostRequest(
        restoreInterventionsUrl,
        restoreInterventionDto,
        locationUuid,
      );
      const data = (await response.json()) as Intervention;
      if ('error' in data) {
        Logger.error(data);
        return data;
      }
      if (data) {
        try {
          const restoreInterventionEntity =
            this.claimInterventionRepository.create({
              locationUuid: locationUuid,
              interventionAction: InterventionActions.Restore,
              consentToken: restoreInterventionDto.consent_token,
              interventionCode: restoreInterventionDto.intervention_code,
              interventionResponse: data,
            });
          await this.claimInterventionRepository.save(
            restoreInterventionEntity,
          );
        } catch (error) {
          Logger.error(error);
        }
      }
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error restoring intervention',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async retireInterventions(
    retireInterventionDto: RetireInterventionDto,
    locationUuid: string,
  ): Promise<Intervention> {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const retireInterventionsUrl = `${baseUrl}/api/v1/claims/interventions/retire`;
    try {
      const response = await this.hieHttpRequests.sendPostRequest(
        retireInterventionsUrl,
        retireInterventionDto,
        locationUuid,
      );
      const data = (await response.json()) as Intervention;
      if ('error' in data) {
        Logger.error(data);
        return data;
      }
      if (data) {
        try {
          const retireInterventionEntity =
            this.claimInterventionRepository.create({
              locationUuid: locationUuid,
              interventionAction: InterventionActions.Retire,
              consentToken: retireInterventionDto.consent_token,
              interventionCode: retireInterventionDto.intervention_code,
              interventionResponse: data,
            });
          await this.claimInterventionRepository.save(retireInterventionEntity);
        } catch (error) {
          Logger.error(error);
        }
      }
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error restoring intervention',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
