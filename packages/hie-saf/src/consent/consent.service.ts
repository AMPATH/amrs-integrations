import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../hie-http-request/hie-http-requests';
import {
  ConsentDto,
  RequestOtpApiResponse,
  TiberbuRequestOtpApiResponse,
  TiberbuValidateConsentApiResponse,
  ValidateConsentApiResponse,
} from '../shared/types';
import { ValidateConsentDto } from 'src/shared/dto/validate-consent.dto';

@Injectable()
export class ConsentService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async requestClientConsent(
    requestConsentDto: ConsentDto,
    locationUuid: string,
  ) {
    const baseUrl = this.configService.get<string>('HIE_BASE_URL') ?? '';
    const clientSearchUrl = `${baseUrl}/hie/api/v1/consent-service/request`;
    try {
      const response = await this.hieHttpRequests.sendPostRequest(
        clientSearchUrl,
        requestConsentDto,
        locationUuid,
      );
      const data = (await response.json()) as RequestOtpApiResponse;
      if (data.status === 'success') {
        const tiberbuResp: TiberbuRequestOtpApiResponse = {
          message: data.message ?? 'OTP sent successfully',
          sessionId: data.id,
          maskedPhone: requestConsentDto.phoneNumber,
        };
        return tiberbuResp;
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
  async validateClientConsent(
    validateConsentDto: ValidateConsentDto,
    locationUuid: string,
  ) {
    const baseUrl = this.configService.get<string>('HIE_BASE_URL') ?? '';
    const clientSearchUrl = `${baseUrl}/hie/api/v1/consent-service/validate-otp`;

    try {
      const response = await this.hieHttpRequests.sendPostRequest(
        clientSearchUrl,
        validateConsentDto,
        locationUuid,
      );
      if ('ok' in response && response['ok'] === false) {
        throw new HttpException(
          'Error ocurred when validating OTP, please retry again',
          HttpStatus.UNAUTHORIZED,
        );
      }
      const data = (await response.json()) as ValidateConsentApiResponse;
      const errorMsg = (
        data['message']
          ? data['message']
          : 'Error ocurred when validating OTP, please retry again'
      ) as string;
      if (data['status'] === 'success') {
        const tiberbuResponse: TiberbuValidateConsentApiResponse = {
          data: {
            identification_type: '',
            identification_number: '',
            status: 'valid',
          },
        };
        return tiberbuResponse;
      } else if (data['status'] === 'error') {
        throw new HttpException(errorMsg, HttpStatus.INTERNAL_SERVER_ERROR);
      } else {
        throw new HttpException(
          'Error ocurred when requesting OTP, please retry again',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    } catch (error: any) {
      Logger.error(error);
      throw new HttpException(
        (error.message as string) ?? 'Error Validating OTP',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
