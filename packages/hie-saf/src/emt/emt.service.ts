import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../hie-http-request/hie-http-requests';
import { PractitionerResolver } from '../shared/utils/practitioner-resolver.helper';
import { InitiateEmtHandoverDto } from './dto/initiate-emt-handover.dto';
import { ListEmtReferralsDto } from './dto/list-emt-referrals.dto';
import { VerifyEmtHandoverDto } from './dto/verify-emt-handover.dto';
import {
  EmtErrorCode,
  EmtInitiateHandoverApiResponse,
  EmtInitiateHandoverPayload,
  EmtNormalizedError,
  EmtReferralsApiResponse,
  EmtVerifyHandoverApiResponse,
  EmtVerifyHandoverPayload,
} from './types';

/**
 * DHA EMT ambulance handover middleware, on the same host as eClaims
 * (`HIE_CLIAMS_BASE_URL`). Non-2xx upstream responses are normalized into
 * `{ statusCode, code, message }` (thrown as the HttpException body) so the
 * frontend can branch on `code` instead of parsing upstream error text.
 * @see https://hie-docs.dha.go.ke/eclaims/emt-handover
 */
@Injectable()
export class EmtService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
    private readonly practitionerResolver: PractitionerResolver,
  ) {}

  /** GET /claims/emt/pending — referrals awaiting action at this facility. */
  async listReferrals(
    dto: ListEmtReferralsDto,
  ): Promise<EmtReferralsApiResponse> {
    const encodedParams = new URLSearchParams();
    if (dto.status) {
      encodedParams.set('status', dto.status);
    }
    if (dto.limit) {
      encodedParams.set('limit', dto.limit);
    }
    if (dto.offset) {
      encodedParams.set('offset', dto.offset);
    }
    const query = encodedParams.toString();
    Logger.log(`Listing EMT referrals for location ${dto.locationUuid}`);
    return this.get<EmtReferralsApiResponse>(
      `/api/v1/claims/emt/pending${query ? `?${query}` : ''}`,
      dto.locationUuid,
      'list emt referrals',
    );
  }

  /**
   * POST /claims/emt/handover/initiate — notify the receiving practitioner
   * that an ambulance handover is ready to accept. The practitioner's
   * `identifier`/`identifier_type`/`regulator` are resolved server side from
   * `sessionCookie`, never taken from the request body.
   */
  async initiateHandover(
    dto: InitiateEmtHandoverDto,
    sessionCookie: string | undefined,
  ): Promise<EmtInitiateHandoverApiResponse> {
    const practitioner =
      await this.practitionerResolver.resolveLoggedInPractitionerIdentity(
        sessionCookie,
        dto.locationUuid,
      );
    const payload: EmtInitiateHandoverPayload = {
      incidence_number: dto.incidenceNumber,
      identifier: practitioner.identifier,
      identifier_type: practitioner.identifierType,
      regulator: practitioner.regulator,
    };
    Logger.log(`Initiating EMT handover for incidence ${dto.incidenceNumber}`);
    return this.post<EmtInitiateHandoverApiResponse>(
      '/api/v1/claims/emt/handover/initiate',
      payload,
      dto.locationUuid,
      'initiate emt handover',
    );
  }

  /** POST /claims/emt/handover/verify — exchange the OTP to confirm the handover. */
  async verifyHandover(
    dto: VerifyEmtHandoverDto,
  ): Promise<EmtVerifyHandoverApiResponse> {
    const payload: EmtVerifyHandoverPayload = {
      incidence_number: dto.incidenceNumber,
      request_id: dto.requestId,
      otp: dto.otp,
    };
    Logger.log(
      `Verifying EMT handover OTP for incidence ${dto.incidenceNumber}`,
    );
    return this.post<EmtVerifyHandoverApiResponse>(
      '/api/v1/claims/emt/handover/verify',
      payload,
      dto.locationUuid,
      'verify emt handover',
    );
  }

  private claimsBaseUrl(): string {
    return this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
  }

  private async get<T>(
    path: string,
    locationUuid: string,
    context: string,
  ): Promise<T> {
    try {
      const response = await this.hieHttpRequests.sendGetRequest(
        `${this.claimsBaseUrl()}${path}`,
        locationUuid,
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
  ): Promise<T> {
    try {
      const response: Response = await this.hieHttpRequests.sendPostRequest(
        `${this.claimsBaseUrl()}${path}`,
        payload,
        locationUuid,
      );
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
      const message =
        typeof data === 'object' && data && 'message' in data
          ? (data as { message: string }).message
          : (typeof data === 'string' && data) ||
            `EMT ${context} failed (${response.status})`;
      Logger.error(
        `EMT ${context} ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`,
      );
      const normalized = this.normalizeError(response.status, message);
      throw new HttpException(normalized, normalized.statusCode);
    }
    return (data ?? {}) as T;
  }

  /**
   * Maps an upstream status + message to a stable `{ statusCode, code,
   * message }` shape. `statusCode` preserves the upstream HTTP status (so
   * generic HTTP tooling still behaves sanely); `code` is the fine-grained
   * category the frontend actually branches on. OTP-specific codes are
   * detected from the message text (rather than which endpoint was called)
   * since a 400 on verify can also be a plain validation error, e.g. a
   * missing `request_id`.
   */
  private normalizeError(status: number, message: string): EmtNormalizedError {
    const statusCode =
      status >= 400 && status < 600 ? status : HttpStatus.BAD_GATEWAY;
    const lowerMessage = message.toLowerCase();
    let code = EmtErrorCode.Unknown;
    if (status === 401 || status === 403) {
      code = EmtErrorCode.AuthFailure;
    } else if (status === 404) {
      code = /already|handled|accepted|rejected|closed/.test(lowerMessage)
        ? EmtErrorCode.AlreadyHandled
        : EmtErrorCode.NotFound;
    } else if (status === 409) {
      code = EmtErrorCode.Conflict;
    } else if (
      (status === 400 || status === 422) &&
      lowerMessage.includes('otp')
    ) {
      code = lowerMessage.includes('expired')
        ? EmtErrorCode.OtpExpired
        : EmtErrorCode.InvalidOtp;
    } else if (status === 400 || status === 422) {
      code = EmtErrorCode.ValidationError;
    } else if (status >= 500) {
      code = EmtErrorCode.UpstreamError;
    }
    return { statusCode, code, message };
  }

  private asHttpException(error: unknown, context: string): HttpException {
    if (error instanceof HttpException) {
      return error;
    }
    Logger.error(error);
    const normalized: EmtNormalizedError = {
      statusCode: HttpStatus.BAD_GATEWAY,
      code: EmtErrorCode.UpstreamError,
      message: `Error trying to ${context}: ${(error as Error)?.message ?? error}`,
    };
    return new HttpException(normalized, normalized.statusCode);
  }
}
