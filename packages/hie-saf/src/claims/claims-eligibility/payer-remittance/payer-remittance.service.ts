import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import { PayerRemittanceDto } from './dto/payer-remittance.dto';
import { ReconciliationBundle } from './types/index';

@Injectable()
export class PayerRemittanceService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async fetchPayerRemittance(payerRemittanceDto: PayerRemittanceDto) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const payerRemittanceUrl = `${baseUrl}/api/v1/claims/payer-remittance/${payerRemittanceDto.claimGuid}`;
    try {
      const response = await this.hieHttpRequests.sendGetRequest(
        payerRemittanceUrl,
        payerRemittanceDto.locationUuid,
      );
      const data = (await response.json()) as ReconciliationBundle;
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error fetching payer remittance',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
