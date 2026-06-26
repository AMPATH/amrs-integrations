import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import { AddCombinedBillingRequestDto } from './dto/add-combined-billing-request.dto';

@Injectable()
export class CombinedBillingService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async addCombinedBillingDetails(
    addCombinedBillingRequestDto: AddCombinedBillingRequestDto,
    locationUuid: string,
    file: any,
  ) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const addCombinedBillingUrl = `${baseUrl}/api/v1/claims/lines`;

    const externalFormData = new FormData();

    try {
      if (file) {
        if (!file.originalname) {
          return false;
        }
        const originalname = (file?.originalname as unknown as string) ?? '';
        const fileBlob = new Blob([file.buffer], { type: file.mimetype });
        externalFormData.append(
          'attachments_0_file_blob',
          fileBlob,
          originalname,
        );
      }

      // map the data
      externalFormData.append(
        'consent_token',
        addCombinedBillingRequestDto.consentToken,
      );
      externalFormData.append(
        'intervention_code',
        addCombinedBillingRequestDto.interventionCode,
      );
      externalFormData.append(
        'charge_date',
        addCombinedBillingRequestDto.chargeDate,
      );
      externalFormData.append(
        'service_name',
        addCombinedBillingRequestDto.serviceName,
      );
      externalFormData.append(
        'service_identifier',
        addCombinedBillingRequestDto.serviceName,
      );
      externalFormData.append(
        'unit_price',
        String(addCombinedBillingRequestDto.unitPrice),
      );
      externalFormData.append(
        'quantity',
        String(addCombinedBillingRequestDto.quantity),
      );
      externalFormData.append(
        'scheme_name',
        addCombinedBillingRequestDto.schemeName,
      );
      externalFormData.append(
        'diagnoses',
        String(addCombinedBillingRequestDto.diagnoses),
      );
      externalFormData.append(
        'attachments',
        String(addCombinedBillingRequestDto.attachments),
      );

      console.log({ externalFormData });
    } catch (error: any) {
      throw new InternalServerErrorException(
        `Failed to forward form data: ${error.message}`,
      );
    }
    try {
      const response = await this.hieHttpRequests.sendFormDataPostRequest(
        addCombinedBillingUrl,
        externalFormData,
        locationUuid,
      );
      const data = await response.json();
      return data ?? [];
    } catch (error) {
      Logger.log(error);
      throw new HttpException(
        'Error adding combined bill',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
