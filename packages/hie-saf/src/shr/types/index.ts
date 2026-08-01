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
}

/** POST /shr/consents body. */
export type ShrConsentRequestPayload = {
  cr_id: string;
  facility_id: string;
  requested_by: string;
  visit_type: ShrVisitType;
};

/** POST /shr/consents/{consent_id}/verify body. */
export type ShrVerifyConsentPayload = {
  otp: string;
  otp_record: string;
};

/** GET /shr/patient-records query. */
export type ShrPatientRecordsQuery = {
  cr_id: string;
  practitioner_id: string;
  resources: string;
  _id?: string;
  page_token?: string;
};

export type ShrRequestConsentApiResponse = {
  consent_id: string;
  consent_status: string;
  message: string;
  otp_record: string;
  status: string;
  visit_type: string;
};

/** Resend returns the same envelope as the initial request, with a fresh `otp_record`. */
export type ShrResendConsentOtpApiResponse = ShrRequestConsentApiResponse;

export type ShrVerifyConsentApiResponse = {
  consent_token: string;
  message: string;
  status: string;
  visit_id: string;
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

export type ShrCloseVisitApiResponse = {
  consent_id: string;
  end_date: string;
  message: string;
  status: string;
  visit_id: string;
};

/** POST /shr/bundles response. */
export type ShrSubmitBundleApiResponse = {
  mediator_id: string;
  message: string;
  status: string;
};

/** FHIR search Bundle / security labels — passed through from DHA unchanged. */
export type ShrPassthroughResponse = Record<string, any>;

/** OpenMRS shapes used to resolve the logged in provider. */
export type OpenMrsProvider = {
  uuid: string;
  identifier?: string;
};

export type OpenMrsSessionWithProvider = {
  authenticated: boolean;
  user?: { uuid: string; display?: string } | null;
  currentProvider?: OpenMrsProvider | null;
};

export type OpenMrsProviderSearchResponse = {
  results?: OpenMrsProvider[];
};
