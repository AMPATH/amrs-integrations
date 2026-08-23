import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../hie-http-request/hie-http-requests';
import { LocationFacilityHelper } from '../shared/utils/location-facility.helper';
import { CloseShrVisitDto } from './dto/close-shr-visit.dto';
import { FetchPatientRecordsDto } from './dto/fetch-patient-records.dto';
import { FetchResourceLabelsDto } from './dto/fetch-resource-labels.dto';
import { GetActiveConsentDto } from './dto/get-active-consent.dto';
import { ListOpenVisitsDto } from './dto/list-open-visits.dto';
import { RequestShrConsentDto } from './dto/request-shr-consent.dto';
import { SubmitShrBundleDto } from './dto/submit-shr-bundle.dto';
import { VerifyShrConsentDto } from './dto/verify-shr-consent.dto';
import { ShrConsentSessionStore } from './shr-consent-session.store';
import {
  ShrActiveConsentResponse,
  ShrActiveConsentSource,
  ShrCloseVisitApiResponse,
  ShrCloseVisitPayload,
  ShrConsentRequestPayload,
  ShrConsentStatusApiResponse,
  ShrOpenVisitsApiResponse,
  ShrPassthroughResponse,
  ShrRefreshConsentApiResponse,
  ShrRequestConsentApiResponse,
  ShrResendConsentOtpApiResponse,
  ShrSubmitBundleApiResponse,
  ShrVerifyConsentApiResponse,
  ShrVerifyConsentPayload,
} from './types';
import {
  consentTokenExpiry,
  consentTokenSubject,
  isConsentTokenUsable,
} from './utils/consent-token.helper';

/** Per visit consent token header required when reading records. */
export const CONSENT_TOKEN_HEADER = 'X-Consent-Token';

/**
 * DHA Shared Health Record middleware. Runs on its own host
 * (`HIE_SHR_BASE_URL`), not the tiberbu `HIE_BASE_URL` the older consent
 * service targets.
 *
 * Consent tokens are still returned to the caller and passed back on reads and
 * writes, but they are now also recorded server side against
 * `(crId, locationUuid)` — see `ShrConsentSessionStore` — so
 * `GET /shr/consents/active` can hand back a usable token without the caller
 * orchestrating open-visits and refresh itself.
 *
 * @see https://hie-docs.dha.go.ke/sharedhealthrecord/shr-consent
 * @see https://hie-docs.dha.go.ke/sharedhealthrecord/shr-records
 */
@Injectable()
export class ShrService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
    private readonly locationFacilityHelper: LocationFacilityHelper,
    private readonly consentSessionStore: ShrConsentSessionStore,
  ) {}

  /**
   * POST /shr/consents — ask the patient to consent to an SHR visit.
   *
   * Two response shapes come back and callers have to tell them apart: a
   * standard request returns `otp_record` and no token, so an OTP step follows;
   * an **emergency** request (`emergency: 1`) is approved on the spot and
   * returns `consent_token` + `visit_id` with no `otp_record`, so records can be
   * read immediately. The emergency path is the one that gets its session
   * recorded here — the standard path gets it at verification.
   *
   * `practitionerId` is resolved from the logged in provider by the caller of
   * this method, never taken from the request body, and is optional: DHA does
   * not reject a request without it, so a resolution failure must not block a
   * consent.
   */
  async requestConsent(dto: RequestShrConsentDto, practitionerId?: string) {
    const payload: ShrConsentRequestPayload = {
      cr_id: dto.crId,
      facility_id: await this.resolveFacilityCode(dto.locationUuid),
      requested_by: dto.requestedBy,
      visit_type: dto.visitType,
      ...(practitionerId ? { practitioner_id: practitionerId } : {}),
      ...(dto.emergency !== undefined ? { emergency: dto.emergency } : {}),
      ...(dto.incapacityReason
        ? { incapacity_reason: dto.incapacityReason }
        : {}),
      ...(dto.patientCapable !== undefined
        ? { patient_capable: dto.patientCapable }
        : {}),
      ...(dto.representativeCrId
        ? { representative_cr_id: dto.representativeCrId }
        : {}),
      ...(dto.representativeRelationship
        ? { representative_relationship: dto.representativeRelationship }
        : {}),
      ...(dto.startDate ? { start_date: dto.startDate } : {}),
    };

    const response = await this.post<ShrRequestConsentApiResponse>(
      '/shr/consents',
      payload,
      dto.locationUuid,
      'request consent',
    );

    // Emergency consents skip the OTP entirely, so this is the only chance to
    // record the session for them.
    if (response.consent_token && response.visit_id) {
      await this.consentSessionStore.recordIssuedToken({
        crId: dto.crId,
        locationUuid: dto.locationUuid,
        visitId: response.visit_id,
        consentToken: response.consent_token,
        consentId: response.consent_id,
      });
    }
    return response;
  }

  /**
   * POST /shr/consents/{consent_id}/verify — records the consent decision.
   *
   * One call, three outcomes: an approval returns the consent token, a refusal
   * (`consentDecision: 'Reject'`) returns the settled status with no token, and
   * an OTP-gated closure returns `end_date`. DHA distinguishes a closure
   * verification from a consent verification server side, from the `otpRecord`,
   * so nothing branches on the way in.
   */
  async verifyConsent(consentId: string, dto: VerifyShrConsentDto) {
    const payload: ShrVerifyConsentPayload = {
      otp_record: dto.otpRecord,
      // Absent on a recorded refusal — the patient never gave a password.
      ...(dto.otp ? { otp: dto.otp } : {}),
      ...(dto.consentDecision ? { consent_decision: dto.consentDecision } : {}),
      ...(dto.rejectionReason ? { rejection_reason: dto.rejectionReason } : {}),
    };
    const response = await this.post<ShrVerifyConsentApiResponse>(
      `/shr/consents/${encodeURIComponent(consentId)}/verify`,
      payload,
      dto.locationUuid,
      'verify consent',
    );

    if (response.consent_token && response.visit_id) {
      // `crId` is not part of DHA's contract here, so it comes from the caller
      // when supplied and otherwise off the token's own `sub` claim. Neither
      // being available only costs us the local session — the consent stands.
      const crId = dto.crId ?? consentTokenSubject(response.consent_token);
      if (crId) {
        await this.consentSessionStore.recordIssuedToken({
          crId,
          locationUuid: dto.locationUuid,
          visitId: response.visit_id,
          consentToken: response.consent_token,
          consentId: response.consent_id ?? consentId,
        });
      } else {
        Logger.warn(
          `Consent ${consentId} was approved but no crId was available, so no consent session was recorded. Send crId on the verify call to track it.`,
        );
      }
    }

    // `end_date` here means this verification completed an OTP-gated closure —
    // the only signal that such a visit is really closed.
    if (response.end_date) {
      if (response.visit_id) {
        await this.consentSessionStore.markClosedByVisit(response.visit_id);
      } else {
        await this.consentSessionStore.markClosedByConsent(
          response.consent_id ?? consentId,
        );
      }
    }
    return response;
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
   * The current token is forwarded when the caller supplies one, and the local
   * session — if there is one for this visit — is updated with the new token.
   */
  async refreshVisitConsent(
    visitId: string,
    locationUuid: string,
    consentToken?: string,
  ) {
    const response = await this.post<ShrRefreshConsentApiResponse>(
      `/shr/visits/${encodeURIComponent(visitId)}/refresh`,
      {},
      locationUuid,
      'refresh visit consent',
      consentToken ? { [CONSENT_TOKEN_HEADER]: consentToken } : undefined,
    );
    if (response.consent_token) {
      await this.consentSessionStore.recordRefreshedToken(
        visitId,
        response.consent_token,
      );
    }
    return response;
  }

  /**
   * POST /shr/visits/{visit_id}/close — end the visit.
   *
   * The body is optional in full. Omitted, closure is OTP-gated: DHA returns
   * `otp_record` and the visit stays open until that password goes through
   * `verifyConsent`. Sending `patientIncapable: 1` (with `incapacityReason`)
   * closes it immediately, for a patient who cannot consent to the closure.
   *
   * The local session is closed only when DHA returns `end_date` — being
   * *called* is not closure, and an OTP-gated response leaves the visit open.
   */
  async closeVisit(
    visitId: string,
    locationUuid: string,
    dto?: CloseShrVisitDto,
  ) {
    const payload: ShrCloseVisitPayload = {
      ...(dto?.patientIncapable !== undefined
        ? { patient_incapable: dto.patientIncapable }
        : {}),
      ...(dto?.incapacityReason
        ? { incapacity_reason: dto.incapacityReason }
        : {}),
    };
    const response = await this.post<ShrCloseVisitApiResponse>(
      `/shr/visits/${encodeURIComponent(visitId)}/close`,
      payload,
      locationUuid,
      'close visit',
    );
    if (response.end_date) {
      await this.consentSessionStore.markClosedByVisit(visitId);
    }
    return response;
  }

  /**
   * GET /shr/open-visits — the visits at this facility that still hold an open
   * consent for the patient. An empty `visits` array means a fresh consent
   * request is needed; anything in it can be reused via `refreshVisitConsent`
   * instead of a second OTP.
   */
  async listOpenVisits(dto: ListOpenVisitsDto) {
    const facilityId = await this.resolveFacilityCode(dto.locationUuid);
    const encodedParams = new URLSearchParams();
    encodedParams.set('patient_id', dto.crId);
    encodedParams.set('facility_id', facilityId);
    return this.get<ShrOpenVisitsApiResponse>(
      `/shr/open-visits?${encodedParams.toString()}`,
      dto.locationUuid,
      'list open visits',
    );
  }

  /**
   * GET /shr/consents/active — one call for "give me a usable consent token for
   * this patient here", so callers stop orchestrating open-visits + refresh
   * themselves.
   *
   * In order:
   *  1. the locally recorded session, handed back as-is when its token's own
   *     `exp` says it is still valid
   *  2. otherwise that session's visit refreshed against DHA — and if the
   *     refresh is rejected, the visit is gone upstream, so the local record is
   *     closed and we fall through
   *  3. otherwise DHA's own open visits for the patient, refreshed and recorded
   *
   * `hasActiveConsent: false` is a normal answer: no open visit, so the caller
   * needs a fresh consent request.
   */
  async getActiveConsent(
    dto: GetActiveConsentDto,
  ): Promise<ShrActiveConsentResponse> {
    const session = await this.consentSessionStore.findOpenSession(
      dto.crId,
      dto.locationUuid,
    );

    if (session && isConsentTokenUsable(session.tokenExpiresAt)) {
      return {
        hasActiveConsent: true,
        message: 'Active consent found',
        source: ShrActiveConsentSource.Local,
        visitId: session.visitId,
        consentId: session.consentId,
        consentToken: session.consentToken,
        tokenExpiresAt: session.tokenExpiresAt?.toISOString() ?? null,
      };
    }

    if (session) {
      const refreshed = await this.tryRefreshToken(
        session.visitId,
        dto.locationUuid,
        session.consentToken,
      );
      if (refreshed) {
        return {
          hasActiveConsent: true,
          message: 'Active consent found, token refreshed',
          source: ShrActiveConsentSource.Refreshed,
          visitId: session.visitId,
          consentId: session.consentId,
          consentToken: refreshed,
          tokenExpiresAt: consentTokenExpiry(refreshed)?.toISOString() ?? null,
        };
      }
      // The visit no longer accepts a refresh, so it is closed upstream even if
      // nothing told us. Stop handing out its token.
      await this.consentSessionStore.markClosedByVisit(session.visitId);
    }

    const openVisits = await this.listOpenVisits({
      crId: dto.crId,
      locationUuid: dto.locationUuid,
    });
    const visitId = openVisits.visits?.[0]?.visit_id;
    if (!visitId) {
      return {
        hasActiveConsent: false,
        message:
          'No open consent visit for this patient at this facility. Request consent first.',
      };
    }

    const consentToken = await this.tryRefreshToken(visitId, dto.locationUuid);
    if (!consentToken) {
      return {
        hasActiveConsent: false,
        message: `Visit ${visitId} is listed as open but its consent token could not be refreshed. Request consent again.`,
        visitId,
      };
    }

    // `open-visits` returns visit ids only, so `consentId` stays unknown here.
    await this.consentSessionStore.recordIssuedToken({
      crId: dto.crId,
      locationUuid: dto.locationUuid,
      visitId,
      consentToken,
    });
    return {
      hasActiveConsent: true,
      message: 'Active consent found from open visits, token refreshed',
      source: ShrActiveConsentSource.OpenVisits,
      visitId,
      consentId: null,
      consentToken,
      tokenExpiresAt: consentTokenExpiry(consentToken)?.toISOString() ?? null,
    };
  }

  /**
   * POST /shr/bundles — submit a FHIR collection Bundle for an open visit.
   * Reuses the same consent token lifecycle as reads; the bundle is
   * forwarded as-is, DHA validates its contents.
   */
  async submitBundle(
    bundle: SubmitShrBundleDto,
    locationUuid: string,
    consentToken: string,
  ) {
    return this.post<ShrSubmitBundleApiResponse>(
      '/shr/bundles',
      bundle,
      locationUuid,
      'submit bundle',
      { [CONSENT_TOKEN_HEADER]: consentToken },
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

  /**
   * Refresh that treats an upstream rejection as "this visit is not usable"
   * rather than an error — `getActiveConsent` has a fallback for that, and a
   * closed visit is a normal thing to walk into.
   */
  private async tryRefreshToken(
    visitId: string,
    locationUuid: string,
    currentToken?: string,
  ): Promise<string | undefined> {
    try {
      const response = await this.refreshVisitConsent(
        visitId,
        locationUuid,
        currentToken,
      );
      return response.consent_token;
    } catch (error) {
      Logger.warn(
        `Could not refresh consent for visit ${visitId}: ${(error as Error)?.message ?? error}`,
      );
      return undefined;
    }
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
      return data;
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
