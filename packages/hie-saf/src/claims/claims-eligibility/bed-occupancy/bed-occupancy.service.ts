import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import { BedOccupancyApiReponse } from './types';

@Injectable()
export class BedOccupancyService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async fetchBedOccupancy(
    frCode: string,
    locationUuid: string,
  ): Promise<BedOccupancyApiReponse> {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const interventionsUrl = `${baseUrl}/api/v1/facilities/${frCode}/beds/occupancy`;
    try {
      const response = await this.hieHttpRequests.sendGetRequest(
        interventionsUrl,
        locationUuid,
      );
      const data = (await response.json()) as BedOccupancyApiReponse;
      return data;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error fetching bed occupancy',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
