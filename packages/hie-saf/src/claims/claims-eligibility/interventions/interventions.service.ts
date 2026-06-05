import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import { InterventionsDto } from './dto/interventions.dto';
import { Intervention, InterventionsApiResponse } from './types';

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
      const response =
        await this.hieHttpRequests.sendGetRequest(interventionsUrl);
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
}
