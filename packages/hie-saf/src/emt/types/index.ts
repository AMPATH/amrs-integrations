/**
 * DHA EMT ambulance handover middleware contracts, on the eClaims host
 * (`HIE_CLIAMS_BASE_URL`).
 * @see https://hie-docs.dha.go.ke/eclaims/emt-handover
 */

export type EmtReferral = {
  submission_id: number;
  cr_id: string;
  status: string;
  case_number: string;
  ambulance_fr_code: string;
  facility_fr_code: string;
  evacuation_scene: string;
  referral_reason: string;
  referral_category: string;
  transport_modality: string;
  referral_notes: string;
  bundle_id: string;
  interventions: string[];
  requested_at: string;
  updated_at: string;
};

/** GET /claims/emt/pending response. */
export type EmtReferralsApiResponse = {
  results: EmtReferral[];
  count: number;
  limit: number;
  offset: number;
};

/** POST /claims/emt/handover/initiate body. */
export type EmtInitiateHandoverPayload = {
  incidence_number: string;
  identifier: string;
  identifier_type: string;
  regulator: string;
};

/**
 * POST /claims/emt/handover/initiate response. Not fully documented upstream —
 * `request_id` is the field the verify step needs back; everything else
 * passes through unchanged.
 */
export type EmtInitiateHandoverApiResponse = {
  request_id?: string;
  message?: string;
  status?: string;
  [key: string]: any;
};

/** POST /claims/emt/handover/verify body. */
export type EmtVerifyHandoverPayload = {
  incidence_number: string;
  request_id: string;
  otp: string;
};

/** POST /claims/emt/handover/verify response — not fully documented upstream. */
export type EmtVerifyHandoverApiResponse = {
  message?: string;
  status?: string;
  [key: string]: any;
};

/**
 * Machine readable error categories the frontend can branch on, since
 * upstream messages/status codes alone aren't a stable contract.
 */
export enum EmtErrorCode {
  AuthFailure = 'auth_failure',
  NotFound = 'not_found',
  AlreadyHandled = 'already_handled',
  Conflict = 'conflict',
  ValidationError = 'validation_error',
  InvalidOtp = 'invalid_otp',
  OtpExpired = 'otp_expired',
  UpstreamError = 'upstream_error',
  Unknown = 'unknown',
}

/** Normalized shape thrown (as the HttpException body) for every non-2xx EMT response. */
export type EmtNormalizedError = {
  statusCode: number;
  code: EmtErrorCode;
  message: string;
};
