/**
 * DHA Shared Health Record (SHR) middleware contracts.
 * @see https://hie-docs.dha.go.ke/sharedhealthrecord/shr-consent
 * @see https://hie-docs.dha.go.ke/sharedhealthrecord/shr-records
 */

export enum ShrVisitType {
  OutPatient = 'OP',
  InPatient = 'IP',
}

/** Documented consent states — DHA is the source of truth, so responses stay `string`. */
export enum ShrConsentStatuses {
  Pending = 'Pending',
  Approved = 'Approved',
  Rejected = 'Rejected',
}

/**
 * DHA's `0`/`1` integer flags. Booleans are not accepted on the request side —
 * `emergency`, `patient_capable` and `patient_incapable` are all integers.
 */
export enum ShrFlag {
  No = 0,
  Yes = 1,
}

/** `consent_decision` on the verify call. DHA also accepts the numeric forms. */
export enum ShrConsentDecision {
  Approve = 'Approve',
  Reject = 'Reject',
}

/** `representative_relationship` — required whenever a representative is named. */
export enum ShrRepresentativeRelationship {
  HealthcareProxy = 'Healthcare Proxy',
  Sibling = 'Sibling',
  Principal = 'Principal',
  Other = 'Other',
}

/**
 * POST /shr/consents body. The same payload covers three cases:
 *  - standard: the four required fields plus `practitioner_id`
 *  - emergency: `emergency: 1` + `incapacity_reason`, approved on the spot
 *  - dependant: `representative_cr_id` + `representative_relationship`, which
 *    route the consent and its OTP to the representative
 *
 * `patient_capable` here is the *opposite polarity* of `patient_incapable` on
 * `ShrCloseVisitPayload` — `patient_capable: 0` and `patient_incapable: 1` both
 * mean "the patient cannot consent for themselves". Easy to mix up.
 */
export type ShrConsentRequestPayload = {
  cr_id: string;
  facility_id: string;
  requested_by: string;
  visit_type: ShrVisitType;
  practitioner_id?: string;
  emergency?: ShrFlag;
  incapacity_reason?: string;
  patient_capable?: ShrFlag;
  representative_cr_id?: string;
  representative_relationship?: ShrRepresentativeRelationship;
  start_date?: string;
};

/**
 * POST /shr/consents/{consent_id}/verify body. No field is mandatory on its own
 * upstream — the combination depends on the channel.
 *
 * `otp_record` identifies the channel and is always sent. `otp` is not: a
 * recorded *refusal* is the case where the patient never handed over a
 * password, so `consent_decision: 'Reject'` goes up with a
 * `rejection_reason` and no `otp`.
 */
export type ShrVerifyConsentPayload = {
  otp_record: string;
  otp?: string;
  consent_decision?: ShrConsentDecision;
  rejection_reason?: string;
};

/**
 * POST /shr/visits/{visit_id}/close body — optional in full. Sent only when the
 * patient cannot consent to the closure themselves.
 *
 * `patient_incapable: 1` closes the visit immediately, with no OTP. Note the
 * polarity is inverted relative to `patient_capable` on
 * `ShrConsentRequestPayload`, where `0` carries the same meaning.
 */
export type ShrCloseVisitPayload = {
  patient_incapable?: ShrFlag;
  incapacity_reason?: string;
};

/** GET /shr/patient-records query. */
export type ShrPatientRecordsQuery = {
  cr_id: string;
  practitioner_id: string;
  resources: string;
  _id?: string;
  page_token?: string;
};

/** GET /shr/open-visits query. */
export type ShrOpenVisitsQuery = {
  patient_id: string;
  facility_id: string;
};

/**
 * POST /shr/consents response. A standard request returns `otp_record` and no
 * token; an **emergency** request is approved immediately and returns
 * `consent_token` + `visit_id` with no `otp_record`. Callers must branch on
 * which of the two arrived rather than assuming an OTP step follows.
 */
export type ShrRequestConsentApiResponse = {
  consent_id: string;
  consent_status: string;
  message: string;
  status: string;
  visit_type: string;
  /** Only on an emergency consent, which is approved without a password. */
  consent_token?: string;
  /** Whether the consent was granted through the emergency route. */
  emergency?: boolean;
  /** Absent on an emergency consent, which needs no password. */
  otp_record?: string;
  /** Only on an emergency consent; a standard consent gets it at verification. */
  visit_id?: string;
};

/** Resend echoes the consent and carries a fresh `otp_record`. */
export type ShrResendConsentOtpApiResponse = {
  consent_id: string;
  consent_status: string;
  message: string;
  otp_record: string;
  status: string;
  visit_type: string;
};

/**
 * POST /shr/consents/{consent_id}/verify response. Three real outcomes, so
 * everything but the envelope is optional:
 *  - approval on the OTP channel: `consent_token` + `visit_id`
 *  - refusal (or an approval captured off the OTP channel): `consent_id` +
 *    `consent_status`, no token
 *  - completion of an OTP-gated closure: `end_date`, no token
 */
export type ShrVerifyConsentApiResponse = {
  message: string;
  status: string;
  consent_id?: string;
  consent_status?: string;
  consent_token?: string;
  /** Only when this verification completed an OTP-gated visit closure. */
  end_date?: string;
  visit_id?: string;
};

export type ShrConsentStatusApiResponse = {
  consent_id: string;
  consent_status: string;
  message: string;
  status: string;
  /** Only issued once the consent is approved. */
  visit_id?: string;
};

export type ShrRefreshConsentApiResponse = {
  consent_token: string;
  message: string;
  status: string;
};

/**
 * POST /shr/visits/{visit_id}/close response. `end_date` means the visit is
 * already closed; `otp_record` means the closure is only *initiated* and the
 * visit stays open until that password is verified through the verify endpoint.
 */
export type ShrCloseVisitApiResponse = {
  consent_id: string;
  message: string;
  status: string;
  visit_id: string;
  /** Returned on an immediate closure. */
  end_date?: string;
  /** Returned on an OTP-gated closure, which has *not* closed the visit yet. */
  otp_record?: string;
};

/** GET /shr/open-visits response. An empty `visits` array means no open visit. */
export type ShrOpenVisitsApiResponse = {
  message: string;
  status: string;
  visits: { visit_id: string }[];
};

/** POST /shr/bundles response. */
export type ShrSubmitBundleApiResponse = {
  mediator_id: string;
  message: string;
  status: string;
};

/** FHIR search Bundle / security labels — passed through from DHA unchanged. */
export type ShrPassthroughResponse = Record<string, any>;

/** Lifecycle of a locally tracked consent session — see `ShrConsentSession`. */
export enum ShrConsentSessionStatus {
  Open = 'open',
  Closed = 'closed',
}

/** Where `GET /shr/consents/active` got the token it is handing back. */
export enum ShrActiveConsentSource {
  /** Straight from the local session — its token has not expired yet. */
  Local = 'local',
  /** Local session found, but its token was stale, so DHA refreshed it. */
  Refreshed = 'refreshed',
  /** No usable local session; the visit came from GET /shr/open-visits. */
  OpenVisits = 'open-visits',
}

/**
 * GET /shr/consents/active response — this middleware's own shape, not DHA's.
 * `hasActiveConsent: false` is a normal answer, not an error: it means the
 * caller must start a fresh consent request.
 */
export type ShrActiveConsentResponse = {
  hasActiveConsent: boolean;
  message: string;
  source?: ShrActiveConsentSource;
  visitId?: string;
  /** Null when the session was reconstructed from `open-visits`, which
   * returns visit ids only. */
  consentId?: string | null;
  consentToken?: string;
  /** Only when the token carries an `exp` claim — see `consent-token.helper`. */
  tokenExpiresAt?: string | null;
};
