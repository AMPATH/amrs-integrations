import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import { InterventionsDto } from './dto/interventions.dto';
import {
  AddInterventionDto,
  Intervention,
  InterventionsApiResponse,
  RestoreInterventionDto,
  RetireInterventionDto,
  SwitchInterventionsDto,
} from './types';
import { VisitIntervention } from '../visit/types';

@Injectable()
export class InterventionsService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async fetchInterventions(
    fetchInterventionsDto: InterventionsDto,
  ): Promise<Intervention[]> {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const interventionsUrl = `${baseUrl}/api/v1/patients/benefits/interventions?patient_id=${fetchInterventionsDto.patient_id}&sub_benefit_code=${fetchInterventionsDto.sub_benefit_code}`;
    try {
      const response = await this.hieHttpRequests.sendGetRequest(
        interventionsUrl,
        fetchInterventionsDto.locationUuid,
      );
      const data = (await response.json()) as InterventionsApiResponse;
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
  ): Promise<VisitIntervention> {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const addInterventionsUrl = `${baseUrl}/api/v1/claims/interventions`;
    try {
      const response = await this.hieHttpRequests.sendPostRequest(
        addInterventionsUrl,
        addInterventionsDto,
        locationUuid,
      );
      const data = (await response.json()) as VisitIntervention;
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
