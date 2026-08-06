import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../hie-http-request/hie-http-requests';
import { FetchHealthWorkerDto } from './dto/fetch-health-worker.dto';
import { HealthWokerApiResponse } from './types';

@Injectable()
export class HealthWorkerRegistryService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async fetchHealthWorkerFromRegistry(
    fetchHealthWorkerDto: FetchHealthWorkerDto,
  ): Promise<any> {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const hwrSearchUrl = `${baseUrl}/api/v1/professionals?identification_number=${fetchHealthWorkerDto.identifierNumber}&identification_type=${fetchHealthWorkerDto.identifierType}&regulator=${fetchHealthWorkerDto.regulator}`;
    try {
      const resp = await this.hieHttpRequests.sendGetRequest(
        hwrSearchUrl,
        fetchHealthWorkerDto.locationUuid,
      );
      const data: HealthWokerApiResponse[] = await resp.json();
      return data;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'An error occurred while fecthing Health Worker',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
