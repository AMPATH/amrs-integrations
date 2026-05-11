import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FetchFacilityDto } from './dto/fetch-facility.dto';
import { Facility } from './types';
import { HieHttpRequests } from '../hie-http-request/hie-http-requests';

@Injectable()
export class FacilityRegistryService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async fetchFacilityFromClientRegistry(
    searchFacilityDto: FetchFacilityDto,
  ): Promise<{ message: Facility }> {
    const baseUrl = this.configService.get<string>('HIE_BASE_URL') ?? '';
    const facilitySearchUrl = `${baseUrl}/fr/v1/facility/search?identifier-type=${searchFacilityDto['identifier-type']}&identifier=${searchFacilityDto.identifier}`;
    try {
      const resp = await this.hieHttpRequests.sendGetRequest(facilitySearchUrl);
      const data: Facility[] = await resp.json();
      return {
        message: data[0],
      };
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'An error occurred while fecthing facility',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
