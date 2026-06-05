import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import { PatientSubBenefitsDto } from './dto/fetch-sub-benefits.dto';
import { SubBenefitsResponse } from '../../../claims/types';

@Injectable()
export class SubBenefitsService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async fetchPatientSubBenefits(fetchSubBenefitsDto: PatientSubBenefitsDto) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const clientSearchUrl = `${baseUrl}/api/v1/patients/sub-benefits?patient_id=${fetchSubBenefitsDto.patient_id}`;
    try {
      const response =
        await this.hieHttpRequests.sendGetRequest(clientSearchUrl);
      const data = (await response.json()) as SubBenefitsResponse;
      return data.results;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error fetching sub benefits',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
