import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import { BenefitsUtilizationDto } from './dto/benefits-utilization.dto';

@Injectable()
export class BenefitsUtilizationService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async fetchBenefitsUtilization(
    benefitsUtilizationDto: BenefitsUtilizationDto,
  ) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const benefitsUtilizationUrl = `${baseUrl}/api/v1/patients/benefits/utilization?patient_id=${benefitsUtilizationDto.patient_id}&intervention_code=${benefitsUtilizationDto.intervention_code}`;
    try {
      const response = await this.hieHttpRequests.sendGetRequest(
        benefitsUtilizationUrl,
        benefitsUtilizationDto.locationUuid,
      );
      const data = (await response.json()) as unknown as any;
      return data;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error fetching benefits utilization',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
