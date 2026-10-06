import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from 'src/hie-http-request/hie-http-requests';
import { PomsfCoverageDto } from './dto/pomsf-coverage.dto';

@Injectable()
export class PomsfCoverageService {
  constructor(
    private readonly httpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}

  async setEffectivePomsfCoverage(
    pomsfCoverageDto: PomsfCoverageDto,
  ): Promise<any> {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const pomsfCoverageUrl = `${baseUrl}/api/v1/authorizations/covers`;
    try {
      const response = await this.httpRequests.sendPostRequest(
        pomsfCoverageUrl,
        pomsfCoverageDto,
        pomsfCoverageDto.locationUuid,
      );
      const data = await response.json();
      if ('error' in data) {
        Logger.error(data);
        return data;
      }
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error Adding claim line',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
