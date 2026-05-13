import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CRPatientApiResponse } from './types';
import { SearchClientDto } from './dto/search-client-dto';
import { HieHttpRequests } from '../hie-http-request/hie-http-requests';

@Injectable()
export class ClientRegistryService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async fetchClientFromClientRegistry(searchClientDto: SearchClientDto) {
    const baseUrl = this.configService.get<string>('HIE_BASE_URL') ?? '';
    const clientSearchUrl = `${baseUrl}/hie/api/v1/patient?identifierType=${searchClientDto.identificationType}&identifierNumber=${searchClientDto.identificationNumber}`;

    try {
      const response =
        await this.hieHttpRequests.sendGetRequest(clientSearchUrl);
      const data = (await response.json()) as CRPatientApiResponse;
      if (data.errorCode) {
        if (data.message?.total === 0) {
          throw new HttpException(
            'Client Not Found',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      }
      return data.message?.result ?? [];
    } catch (error) {
      console.error(error);
      throw new HttpException(
        'Error fetching Data',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
