/**
 * Types shared across the SHR visit-submission feature:
 *
 *  1. OpenMRS REST shapes — only the fields the custom representations request
 *     (see openmrs-visit.client.ts). Names mirror the REST module's casing.
 *  2. The subset of FHIR R4B the mapper emits — a `collection` Bundle, the
 *     shape DHA's middleware demands for `POST /shr/bundles` (see
 *     SubmitShrBundleDto, verified against UAT).
 *  3. The endpoint contract for `POST /shr/visit-submission` — camelCase both
 *     ways, matching the shr module's own routes (e.g. `GET /shr/consents/active`
 *     returns `hasActiveConsent`).
 *  4. The mapper's per-request options and its MissingPreconditionError.
 */

// ─────────────────────────────────────────────────────────────────────────────
// OpenMRS REST shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface OpenMrsConceptMapping {
  conceptMapType?: { display?: string };
  conceptReferenceTerm?: { code?: string; conceptSource?: { name?: string } };
}

export interface OpenMrsConcept {
  uuid: string;
  display?: string;
  datatype?: { display?: string };
  mappings?: OpenMrsConceptMapping[];
}

export interface OpenMrsIdentifier {
  identifier?: string;
  preferred?: boolean;
  identifierType?: { uuid?: string; display?: string };
}

export interface OpenMrsPatient {
  uuid: string;
  identifiers?: OpenMrsIdentifier[];
  person?: {
    uuid?: string;
    gender?: string;
    birthdate?: string;
    dead?: boolean;
    preferredName?: {
      givenName?: string;
      middleName?: string;
      familyName?: string;
    } | null;
  };
}

export interface OpenMrsVisitAttribute {
  uuid?: string;
  /** String, or a Concept-shaped object for coded attributes. */
  value?: unknown;
  valueReference?: string;
  attributeType?: { uuid?: string; display?: string };
}

export interface OpenMrsVisit {
  uuid: string;
  /**
   * The visit's type concept — concept-shaped so the clinical family can emit
   * it as `Encounter.type` coding (VISIT_REP requests uuid + display).
   */
  visitType?: OpenMrsConcept;
  location?: { uuid?: string; display?: string };
  /** Ownership check: the visit lookup must not serve another patient's data. */
  patient?: { uuid?: string };
  startDatetime?: string;
  /** Set exactly when the visit has been closed — the "visit closed" signal. */
  stopDatetime?: string | null;
  attributes?: OpenMrsVisitAttribute[];
}

export interface OpenMrsObs {
  uuid: string;
  voided?: boolean;
  obsDatetime?: string;
  concept?: OpenMrsConcept;
  /** Raw value — typed fields below are preferred when present. */
  value?: unknown;
  valueText?: string | null;
  valueNumeric?: number | null;
  valueCoded?: OpenMrsConcept | null;
  valueDate?: string | null;
  valueDatetime?: string | null;
  valueBoolean?: boolean | null;
  groupMembers?: OpenMrsObs[] | null;
}

export interface OpenMrsDiagnosis {
  uuid?: string;
  rank?: number | null;
  /** 'CONFIRMED' | 'PROVISIONAL', or a Concept-shaped object with that display. */
  certainty?: string | { display?: string } | null;
  diagnosis?: {
    coded?: OpenMrsConcept | null;
    nonCoded?: string | { display?: string } | null;
  } | null;
}

export interface OpenMrsEncounterProvider {
  uuid?: string;
  voided?: boolean;
  provider?: { uuid?: string; display?: string };
}

export interface OpenMrsEncounter {
  uuid: string;
  encounterDatetime?: string;
  encounterType?: { uuid?: string; display?: string };
  location?: { uuid?: string; display?: string };
  visit?: { uuid?: string } | null;
  voided?: boolean;
  encounterProviders?: OpenMrsEncounterProvider[];
  diagnoses?: OpenMrsDiagnosis[];
  obs?: OpenMrsObs[];
}

/** Everything the OpenMRS gather step collected for one closed visit. */
export interface ClosedVisitContext {
  patient: OpenMrsPatient;
  /** Null when the patient has no closed visit — a "skipped" outcome, not an error. */
  visit: OpenMrsVisit | null;
  encounters: OpenMrsEncounter[];
}

// ─────────────────────────────────────────────────────────────────────────────
// FHIR R4B subset emitted by the mapper
// ─────────────────────────────────────────────────────────────────────────────

export interface FhirCoding {
  system?: string;
  code?: string;
  display?: string;
}

export interface FhirCodeableConcept {
  coding?: FhirCoding[];
  text?: string;
}

export interface FhirIdentifier {
  use?: 'official';
  system?: string;
  value?: string;
  type?: FhirCodeableConcept;
}

export interface FhirReference {
  reference?: string;
  type?: string;
  identifier?: FhirIdentifier;
  display?: string;
}

export interface FhirExtension {
  url: string;
  valueBoolean?: boolean;
  valueString?: string;
  valueCodeableConcept?: FhirCodeableConcept;
  valueReference?: FhirReference;
  extension?: FhirExtension[];
}

export interface FhirMeta {
  profile?: string[];
  source?: string;
  lastUpdated?: string;
}

export interface FhirResourceBase {
  resourceType: string;
  id?: string;
  meta?: FhirMeta;
  identifier?: FhirIdentifier[];
  extension?: FhirExtension[];
}

/** Minimal structural type — the mapper owns the concrete shapes it emits. */
export interface FhirResource extends FhirResourceBase {
  [key: string]: unknown;
}

/**
 * A `collection` Bundle entry: `{ fullUrl, resource }` only. `entry.request`
 * exists solely on batch/transaction bundles, so the conditional-create
 * mechanics do not apply — DHA's middleware owns identity and deduplication on
 * its side, and the deterministic `fullUrl`s/`id` below keep bundles diffable.
 */
export interface FhirBundleEntry {
  fullUrl: string;
  resource: FhirResource;
}

export interface FhirBundle {
  resourceType: 'Bundle';
  id: string;
  meta?: FhirMeta;
  type: 'collection';
  timestamp?: string;
  entry?: FhirBundleEntry[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapper options and result
// ─────────────────────────────────────────────────────────────────────────────

export interface VitalSignConceptMapping {
  loinc: string;
  unit?: string;
  unitCode?: string;
}

/**
 * The bundle family — which of the two supported shapes the mapper emits
 * (see docs/shr-visit-submission.md, "Bundle families"):
 *
 *  - `emergency` — the Kenya Emergency Care IG scaffolding: an
 *    `em-poc-encounter` hanging off an `em-incident-encounter` plus an
 *    EpisodeOfCare, incident/dispatch identifiers and a triage acuity;
 *  - `clinical` — routine non-emergency care: one base-R4B Encounter whose
 *    class comes from the AMRS visit type, carrying no emergency vocabulary.
 *    The SHR's only enforced Encounter profiles are the emergency ones, so a
 *    plain Encounter is the conformant way to submit ordinary care.
 */
export type VisitSubmissionFamily = 'emergency' | 'clinical';

/**
 * What a request may ask for: a concrete family, or `auto` — decide from the
 * visit type via `SHA_VISIT_TYPE_FAMILY_MAP` / `SHA_DEFAULT_SUBMISSION_FAMILY`.
 */
export type SubmissionFamilySelection = 'auto' | VisitSubmissionFamily;

/**
 * Per-request mapping options — everything site-specific the mapper needs.
 * Built by ShrVisitSubmissionService from ConfigService (env overrides over
 * sha-ig.constants defaults) plus the facility resolved from `locationUuid`.
 */
export interface ShrVisitBundleOptions {
  /** Which bundle family to build — resolved by ShrVisitSubmissionService. */
  family: VisitSubmissionFamily;
  /** Canonical root for profile / code-system URLs baked into the bundle. */
  shaCanonicalBase: string;
  /** Provenance URI stamped on `Bundle.meta.source`. */
  amrsSourceUri: string;
  amrsConceptSystemUrl: string;
  amrsDerivedIdentifierSystem: string;
  amrsPractitionerIdentifierSystem: string;
  /** OpenMRS identifier-type UUIDs this deployment uses for SHA identifiers. */
  patientIdentifierTypes: Readonly<{
    crNumber: string;
    upi: string;
    nationalId: string;
    shaNumber: string;
    birthCertificate: string;
  }>;
  /** SHA identifier systems, keyed the same as `patientIdentifierTypes`. */
  patientIdentifierSystems: Readonly<{
    crNumber: string;
    upi: string;
    nationalId: string;
    shaNumber: string;
    birthCertificate: string;
  }>;
  /** AMRS vitals concept UUID → SHA vital-sign LOINC code + UCUM unit. */
  vitalSignsConceptMap: Readonly<Record<string, VitalSignConceptMapping>>;
  /** Triage/queue-priority concept UUID → em-clinical-acuity code. */
  acuityConceptMap: Readonly<Record<string, string>>;
  incidentIdAttributeTypeUuid: string;
  dispatchIdAttributeTypeUuid: string;
  incidentTypeCode: string;
  /**
   * AMRS visit-type UUID → v3-ActEncounterCode class code (AMB/IMP/…), for
   * the clinical family's Encounter.class.
   */
  visitTypeClassMap: Readonly<Record<string, string>>;
  /** Class used when the visit type is not in `visitTypeClassMap`. */
  defaultEncounterClass: string;
  /** The facility this visit belongs to (Organization / serviceProvider). */
  facility: Readonly<{ code: string; name?: string }>;
  maxObservationsPerBundle: number;
  maxBundleEntries: number;
}

/** Result of the mapping step. */
export interface ShrVisitBundleBuild {
  bundle: FhirBundle;
  /** Non-fatal notes: defaulted acuity, skipped empty observations, clamps. */
  warnings: string[];
  /** Entry counts per resource type, for logs and the endpoint response. */
  stats: Record<string, number>;
  /** The family that was built. */
  family: VisitSubmissionFamily;
  /**
   * The incident identifier the bundle hangs together by — emergency family
   * only; the clinical family has no incident scaffolding.
   */
  incidentId?: string;
  /** Whether the patient's identity could be verified via CR/UPI. */
  identityVerified: boolean;
}

/**
 * The AMRS data cannot satisfy a mandatory IG element — the bundle cannot be
 * built. The service maps this onto HttpStatus.UNPROCESSABLE_ENTITY.
 */
export class MissingPreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingPreconditionError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint contract (`POST /shr/visit-submission`)
// ─────────────────────────────────────────────────────────────────────────────

export type VisitSubmissionStatus =
  /** DHA's middleware accepted the bundle. */
  | 'submitted'
  /** dryRun=true — built (and optionally pre-validated) but not submitted. */
  | 'validated'
  /** Nothing to do — no closed visit exists for the patient. */
  | 'skipped'
  /** The workflow ran and did not succeed. `errors` says why. */
  | 'failed';

/** One `OperationOutcome.issue`, as reported by the SHA FHIR server. */
export interface ShaIssueSummary {
  severity: string;
  diagnostics?: string;
  location?: string[];
  /** True when this issue matches the documented UAT ValueSet-expansion defect. */
  knownTerminologyDefect?: boolean;
}

export interface ShaValidationOutcome {
  ok: boolean;
  httpStatus: number;
  issues: ShaIssueSummary[];
  /** Issues at error severity that are NOT the known terminology defect. */
  blockingIssues: ShaIssueSummary[];
}

export interface VisitSubmissionResponse {
  status: VisitSubmissionStatus;
  /** Echo of the request's patientUuid. */
  patientUuid: string;
  visitUuid?: string;
  /** ISO datetime the visit was closed (`stopDatetime`). */
  visitClosedAt?: string;
  /** The bundle family that was built (and submitted). */
  submissionFamily?: VisitSubmissionFamily;
  /** Count of resources in the submitted bundle. */
  entries?: number;
  /** Where the consent token came from, when one was needed. */
  consentTokenSource?: 'request' | 'active-consent';
  /** DHA mediator's acknowledgement of the submitted bundle. */
  mediatorId?: string;
  mediatorMessage?: string;
  mediatorStatus?: string;
  /** Present when the bundle was pre-validated against the SHA FHIR IG. */
  validationIssues?: ShaIssueSummary[];
  /** Non-fatal notes from the mapping step. */
  warnings?: string[];
  message?: string;
  errors?: string[];
}
