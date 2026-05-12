import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from 'src/hie-http-request/hie-http-requests';
import { FetchHealthWorkerDto } from './dto/fetch-health-worker.dto';
import { HealthWokerApiResponse } from './types';

@Injectable()
export class HealthWorkerRegistryService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async fetchFacilityFromClientRegistry(
    fetchHealthWorkerDto: FetchHealthWorkerDto,
  ): Promise<any> {
    const baseUrl = this.configService.get<string>('HIE_BASE_URL') ?? '';
    const encodedParams = new URLSearchParams();
    encodedParams.set('identifierType', fetchHealthWorkerDto.identifierType);
    encodedParams.set(
      'identifierNumber',
      fetchHealthWorkerDto.identifierNumber,
    );
    encodedParams.set('regulator', fetchHealthWorkerDto.regulator);
    const hwrSearchUrl = `${baseUrl}/hie/api/v1/professional?${encodedParams.toString()}`;
    try {
      const resp = await this.hieHttpRequests.sendGetRequest(hwrSearchUrl);
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
