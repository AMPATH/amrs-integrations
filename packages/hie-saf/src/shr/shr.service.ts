import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../hie-http-request/hie-http-requests';
import { LocationFacilityHelper } from '../shared/utils/location-facility.helper';
import { FetchPatientRecordsDto } from './dto/fetch-patient-records.dto';
import { FetchResourceLabelsDto } from './dto/fetch-resource-labels.dto';
import { RequestShrConsentDto } from './dto/request-shr-consent.dto';
import { VerifyShrConsentDto } from './dto/verify-shr-consent.dto';
import {
  ShrCloseVisitApiResponse,
  ShrConsentRequestPayload,
  ShrConsentStatusApiResponse,
  ShrPassthroughResponse,
  ShrRefreshConsentApiResponse,
  ShrRequestConsentApiResponse,
  ShrResendConsentOtpApiResponse,
  ShrVerifyConsentApiResponse,
  ShrVerifyConsentPayload,
} from './types';

/** Per visit consent token header required when reading records. */
export const CONSENT_TOKEN_HEADER = 'X-Consent-Token';

/**
 * DHA Shared Health Record middleware. Runs on its own host
 * (`HIE_SHR_BASE_URL`), not the tiberbu `HIE_BASE_URL` the older consent
 * service targets, and holds no consent state between requests — tokens are
 * returned to the caller and passed back on the read.
 * @see https://hie-docs.dha.go.ke/sharedhealthrecord/shr-consent
 * @see https://hie-docs.dha.go.ke/sharedhealthrecord/shr-records
 */
@Injectable()
export class ShrService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
    private readonly locationFacilityHelper: LocationFacilityHelper,
  ) {}

  /** POST /shr/consents — ask the patient to consent to an SHR visit. */
  async requestConsent(dto: RequestShrConsentDto) {
    const payload: ShrConsentRequestPayload = {
      cr_id: dto.crId,
      facility_id: await this.resolveFacilityCode(dto.locationUuid),
      requested_by: dto.requestedBy,
      visit_type: dto.visitType,
    };
    console.log('ShrService.requestConsent payload:', payload);
  
    return this.post<ShrRequestConsentApiResponse>(
      '/shr/consents',
      payload,
      dto.locationUuid,
      'request consent',
    );
  }

  /** POST /shr/consents/{consent_id}/verify — exchange the OTP for a consent token. */
  async verifyConsent(consentId: string, dto: VerifyShrConsentDto) {
    const payload: ShrVerifyConsentPayload = {
      otp: dto.otp,
      otp_record: dto.otpRecord,
    };
    return this.post<ShrVerifyConsentApiResponse>(
      `/shr/consents/${encodeURIComponent(consentId)}/verify`,
      payload,
      dto.locationUuid,
      'verify consent',
    );
  }

  /** GET /shr/consents/{consent_id}/status — poll until the consent is approved. */
  async getConsentStatus(consentId: string, locationUuid: string) {
    return this.get<ShrConsentStatusApiResponse>(
      `/shr/consents/${encodeURIComponent(consentId)}/status`,
      locationUuid,
      'get consent status',
    );
  }

  /** POST /shr/consents/{consent_id}/resend-otp — returns a fresh `otp_record`. */
  async resendConsentOtp(consentId: string, locationUuid: string) {
    return this.post<ShrResendConsentOtpApiResponse>(
      `/shr/consents/${encodeURIComponent(consentId)}/resend-otp`,
      {},
      locationUuid,
      'resend consent otp',
    );
  }

  /**
   * POST /shr/visits/{visit_id}/refresh — fresh consent token for an open visit.
   * The current token is forwarded when the caller supplies one.
   */
  async refreshVisitConsent(
    visitId: string,
    locationUuid: string,
    consentToken?: string,
  ) {
    return this.post<ShrRefreshConsentApiResponse>(
      `/shr/visits/${encodeURIComponent(visitId)}/refresh`,
      {},
      locationUuid,
      'refresh visit consent',
      consentToken ? { [CONSENT_TOKEN_HEADER]: consentToken } : undefined,
    );
  }

  /** POST /shr/visits/{visit_id}/close — end the visit. */
  async closeVisit(visitId: string, locationUuid: string) {
    return this.post<ShrCloseVisitApiResponse>(
      `/shr/visits/${encodeURIComponent(visitId)}/close`,
      {},
      locationUuid,
      'close visit',
    );
  }

  /**
   * GET /shr/patient-records — the FHIR search Bundle is returned unchanged.
   * `practitionerId` is resolved from the logged in provider by the caller of
   * this method, never taken from the request body.
   */
  async fetchPatientRecords(
    dto: FetchPatientRecordsDto,
    practitionerId: string,
    consentToken: string,
  ) {
    const encodedParams = new URLSearchParams();
    encodedParams.set('cr_id', dto.crId);
    encodedParams.set('practitioner_id', practitionerId);
    encodedParams.set('resources', dto.resources);
    if (dto._id) {
      encodedParams.set('_id', dto._id);
    }
    if (dto.pageToken) {
      encodedParams.set('page_token', dto.pageToken);
    }
    return this.get<ShrPassthroughResponse>(
      `/shr/patient-records?${encodedParams.toString()}`,
      dto.locationUuid,
      'fetch patient records',
      { [CONSENT_TOKEN_HEADER]: consentToken },
    );
  }

  /** GET /shr/resource-labels — security labels, returned unchanged. */
  async fetchResourceLabels(dto: FetchResourceLabelsDto) {
    const encodedParams = new URLSearchParams();
    if (dto.resourceName) {
      encodedParams.set('resource_name', dto.resourceName);
    }
    if (dto.code) {
      encodedParams.set('code', dto.code);
    }
    return this.get<ShrPassthroughResponse>(
      `/shr/resource-labels?${encodedParams.toString()}`,
      dto.locationUuid,
      'fetch resource labels',
    );
  }

  private shrBaseUrl(): string {
    return this.configService.get<string>('HIE_SHR_BASE_URL') ?? '';
  }

  private async resolveFacilityCode(locationUuid: string): Promise<string> {
    const facility =
      await this.locationFacilityHelper.getFacilityUsingLocationUuid(
        locationUuid,
      );
    if (!facility) {
      throw new HttpException('Missing facility', HttpStatus.BAD_REQUEST);
    }
    if (!facility.frCode) {
      throw new HttpException('Missing facility code', HttpStatus.BAD_REQUEST);
    }
    return facility.frCode;
  }

  private async get<T>(
    path: string,
    locationUuid: string,
    context: string,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    try {
      const response = await this.hieHttpRequests.sendGetRequest(
        `${this.shrBaseUrl()}${path}`,
        locationUuid,
        extraHeaders,
      );
      return await this.readResponse<T>(response, context);
    } catch (error) {
      throw this.asHttpException(error, context);
    }
  }

  private async post<T>(
    path: string,
    payload: any,
    locationUuid: string,
    context: string,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    try {
      const response: Response = await this.hieHttpRequests.sendPostRequest(
        `${this.shrBaseUrl()}${path}`,
        payload,
        locationUuid,
        extraHeaders,
      );
      const data = await this.readResponse<T>(response, context);
      if (this.configService.get<string>('APP_ENV') === 'development') {
        Logger.debug(`HIE ${context} response: ${JSON.stringify(data)}`);
      }
      return await this.readResponse<T>(response, context);
    } catch (error) {
      throw this.asHttpException(error, context);
    }
  }

  private async readResponse<T>(
    response: Response,
    context: string,
  ): Promise<T> {
    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!response.ok) {
      Logger.error(
        `SHR ${context} ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`,
      );
      throw new HttpException(
        typeof data === 'object' && data && 'message' in data
          ? (data as { message: string }).message
          : `SHR ${context} failed (${response.status})`,
        response.status >= 400 && response.status < 600
          ? response.status
          : HttpStatus.BAD_GATEWAY,
      );
    }
    return (data ?? {}) as T;
  }

  private asHttpException(error: unknown, context: string): HttpException {
    if (error instanceof HttpException) {
      return error;
    }
    Logger.error(error);
    return new HttpException(
      `Error trying to ${context}: ${(error as Error)?.message ?? error}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
