import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocationFacilityHelper } from '../shared/utils/location-facility.helper';
import { RequestTelemedicineSessionDto } from './dto/request-telemedicine-session.dto';
import { LiviaSsoTokenResponse } from './types';

/**
 * Telemedicine SSO broker — `POST /telemedicine/sso/token`.
 *
 * Mints a partner (Livia) single-sign-on session for the logged-in
 * practitioner:
 *
 *   1. resolve the facility from the caller's `locationUuid` — its FR code is
 *      the `facility_code` the partner keys on (same facility identity the
 *      SHR visit-submission route stamps on bundles);
 *   2. call the partner SSO endpoint with the deployment's `username` /
 *      `password` credentials — held here, never shipped to the browser, the
 *      same trust split as every other partner call this service brokers;
 *   3. answer with Livia's `{ code, expires_in, redirect_url }` verbatim, so
 *      the caller embeds `redirect_url` and re-mints when `expires_in`
 *      (seconds) runs out.
 *
 * The caller is expected to have already resolved the practitioner national ID
 * (OpenMRS provider attribute `PROVIDER_NATIONAL_ID_UUID`); this service never
 * touches OpenMRS itself.
 *
 * Configuration (all optional — when absent the route answers 503 so a
 * deployment that doesn't use telemedicine is otherwise unaffected):
 *
 *   LIVIA_SSO_BASE_URL   e.g. https://api.liviaapp.net
 *   LIVIA_SSO_USERNAME   the health-center username Livia issued
 *   LIVIA_SSO_PASSWORD   the password Livia issued
 */
@Injectable()
export class TelemedicineService {
  private static readonly SSO_TOKEN_PATH = '/api/partner/sso/token';

  private readonly liviaSsoBaseUrl: string;
  private readonly liviaUsername: string;
  private readonly liviaPassword: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly locationFacilityHelper: LocationFacilityHelper,
  ) {
    this.liviaSsoBaseUrl =
      this.configService.get<string>('LIVIA_SSO_BASE_URL') ?? '';
    this.liviaUsername =
      this.configService.get<string>('LIVIA_SSO_USERNAME') ?? '';
    this.liviaPassword =
      this.configService.get<string>('LIVIA_SSO_PASSWORD') ?? '';
  }

  async requestSsoToken(
    dto: RequestTelemedicineSessionDto,
  ): Promise<LiviaSsoTokenResponse> {
    if (!this.liviaSsoBaseUrl || !this.liviaUsername || !this.liviaPassword) {
      throw new HttpException(
        'Telemedicine SSO is not configured on this deployment.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const facility =
      await this.locationFacilityHelper.getFacilityUsingLocationUuid(
        dto.locationUuid,
      );
    if (!facility) {
      throw new BadRequestException('Missing facility');
    }
    if (!facility.frCode) {
      throw new BadRequestException('Missing facility code');
    }

    // An application-level `code` other than 200 is Livia refusing the
    // request (bad credentials, unknown facility, …) — surfaced as a 502
    // carrying whatever message Livia gave, since HTTP itself was 200.
    let body: LiviaSsoTokenResponse;
    try {
      const response = await fetch(
        `${this.liviaSsoBaseUrl}${TelemedicineService.SSO_TOKEN_PATH}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            username: this.liviaUsername,
            password: this.liviaPassword,
          },
          body: JSON.stringify({
            facility_code: facility.frCode,
            national_id: dto.nationalId,
          }),
        },
      );
      const raw = await response.text();
      if (!response.ok) {
        Logger.error(
          `Livia SSO token request failed (${response.status}): ${raw}`,
        );
        throw new HttpException(
          `Livia SSO token request failed (${response.status}).`,
          HttpStatus.BAD_GATEWAY,
        );
      }
      body = JSON.parse(raw) as LiviaSsoTokenResponse;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      Logger.error(error);
      throw new HttpException(
        `Error requesting the Livia SSO token: ${(error as Error)?.message ?? error}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (body.code !== 200) {
      Logger.error(
        `Livia SSO token request rejected with code ${body.code}: ${body.message ?? 'no message'}`,
      );
      throw new HttpException(
        body.message ??
          `Livia SSO token request was rejected (code ${body.code}).`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    Logger.log(
      `Livia SSO token minted for facility ${facility.frCode} ` +
        `(expires in ${body.expires_in ?? '?'}s).`,
    );
    return body;
  }
}
