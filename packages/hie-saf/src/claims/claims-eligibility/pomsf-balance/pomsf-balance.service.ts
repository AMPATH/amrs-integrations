import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import { PomsfBalanceDto } from './dto/pomsf-balance.dto';

@Injectable()
export class PomsfBalanceService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}
  async fetchPomsfBalance(
    pomsfBalanceDto: PomsfBalanceDto,
  ) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    let pomsfBalanceUrl = `${baseUrl}/api/v1/patients/pomsf-balances?patient_id=${pomsfBalanceDto.patient_id}`;
    if(pomsfBalanceDto.policyYear) {
      pomsfBalanceUrl = pomsfBalanceUrl + `&policy_year=${pomsfBalanceDto.policyYear}`; 
    }
    if(pomsfBalanceDto.principalMemberNumber) {
      pomsfBalanceUrl = pomsfBalanceUrl + `&principal_member_number=${pomsfBalanceDto.principalMemberNumber}`; 
    }
    try {
      const response = await this.hieHttpRequests.sendGetRequest(
        pomsfBalanceUrl,
        pomsfBalanceDto.locationUuid,
      );
      const data = (await response.json()) as unknown as any;
      return data;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error fetching Pomsf balance',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
