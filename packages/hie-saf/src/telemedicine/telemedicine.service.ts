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
import { RequestPatientTelemedicineSessionDto } from './dto/request-patient-telemedicine-session.dto';
import { LiviaSsoTokenResponse } from './types';

/**
 * Telemedicine SSO broker — the `/telemedicine/sso/*` routes.
 *
 * Mints partner (Livia) single-sign-on sessions:
 *
 *   - `requestSsoToken` for the logged-in practitioner (home dashboard) —
 *     patient selection happens inside the telemedicine app;
 *   - `requestPatientSsoToken` for one patient consult (patient chart) —
 *     Livia keys the session on the doctor's and the patient's national IDs,
 *     plus the visit's consent token when there is one.
 *
 * Both share the same shape:
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
 * The caller is expected to have already resolved the national IDs (OpenMRS
 * provider attribute / patient identifier); this service never touches OpenMRS
 * itself.
 *
 * Configuration (all optional — when absent the routes answer 503 so a
 * deployment that doesn't use telemedicine is otherwise unaffected):
 *
 *   LIVIA_SSO_BASE_URL   e.g. https://api.liviaapp.net
 *   LIVIA_SSO_USERNAME   the health-center username Livia issued
 *   LIVIA_SSO_PASSWORD   the password Livia issued
 */
@Injectable()
export class TelemedicineService {
  private static readonly SSO_TOKEN_PATH = '/api/partner/sso/token';
  private static readonly PATIENT_SSO_TOKEN_PATH =
    '/api/partner/sso/patient-token';

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
    this.assertConfigured();
    const facilityCode = await this.resolveFacilityCode(dto.locationUuid);

    return this.callLivia(TelemedicineService.SSO_TOKEN_PATH, {
      facility_code: facilityCode,
      national_id: dto.nationalId,
    });
  }

  async requestPatientSsoToken(
    dto: RequestPatientTelemedicineSessionDto,
  ): Promise<LiviaSsoTokenResponse> {
    this.assertConfigured();
    const facilityCode = await this.resolveFacilityCode(dto.locationUuid);

    return this.callLivia(TelemedicineService.PATIENT_SSO_TOKEN_PATH, {
      facility_code: facilityCode,
      doctor_national_id: dto.doctorNationalId,
      patient_national_id: dto.patientNationalId,
      // Optional on the wire too — omitted entirely rather than sent empty.
      ...(dto.consentToken ? { consent_token: dto.consentToken } : {}),
    });
  }

  private assertConfigured(): void {
    if (!this.liviaSsoBaseUrl || !this.liviaUsername || !this.liviaPassword) {
      throw new HttpException(
        'Telemedicine SSO is not configured on this deployment.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /** The FR code for the caller's facility — the partner's facility identity. */
  private async resolveFacilityCode(locationUuid: string): Promise<string> {
    const facility =
      await this.locationFacilityHelper.getFacilityUsingLocationUuid(
        locationUuid,
      );
    if (!facility) {
      throw new BadRequestException('Missing facility');
    }
    if (!facility.frCode) {
      throw new BadRequestException('Missing facility code');
    }
    return facility.frCode;
  }

  /**
   * POST to Livia and hand back its answer. An application-level `code` other
   * than 200 is Livia refusing the request (bad credentials, unknown facility,
   * …) — surfaced as a 502 carrying whatever message Livia gave, since HTTP
   * itself was 200.
   */
  private async callLivia(
    path: string,
    body: Record<string, string>,
  ): Promise<LiviaSsoTokenResponse> {
    let parsed: LiviaSsoTokenResponse;
    try {
      const response = await fetch(`${this.liviaSsoBaseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          username: this.liviaUsername,
          password: this.liviaPassword,
        },
        body: JSON.stringify(body),
      });
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
      parsed = JSON.parse(raw) as LiviaSsoTokenResponse;
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

    if (parsed.code !== 200) {
      Logger.error(
        `Livia SSO token request rejected with code ${parsed.code}: ${parsed.message ?? 'no message'}`,
      );
      throw new HttpException(
        parsed.message ??
          `Livia SSO token request was rejected (code ${parsed.code}).`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    Logger.log(
      `Livia SSO token minted (${path}) for facility ${body.facility_code} ` +
        `(expires in ${parsed.expires_in ?? '?'}s).`,
    );
    return parsed;
  }
}
