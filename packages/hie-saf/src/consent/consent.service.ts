import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../hie-http-request/hie-http-requests';
import { RequestConsentDto } from '../shared/dto/request-consent.dto';
import { RequestOtpApiResponse } from '../shared/types';

@Injectable()
export class ConsentService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async requestClientConsent(requestConsentDto: RequestConsentDto) {
    const baseUrl = this.configService.get<string>('HIE_BASE_URL') ?? '';
    const clientSearchUrl = `${baseUrl}/hie/api/v1/consent-service/request`;

    try {
      const response = await this.hieHttpRequests.sendPostRequest(
        clientSearchUrl,
        requestConsentDto,
      );
      const data = (await response.json()) as RequestOtpApiResponse;
      if (data.status === 'success') {
        return data;
      } else if (data.status === 'error') {
        throw new HttpException(
          data.error ?? 'Error ocurred when requesting OTP, please retry again',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      } else {
        throw new HttpException(
          'Error ocurred when requesting OTP, please retry again',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    } catch (error) {
      console.error(error);
      throw new HttpException(
        'Error fetching Data',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
