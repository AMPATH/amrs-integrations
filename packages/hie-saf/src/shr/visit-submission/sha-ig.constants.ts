/**
 * SHA FHIR IG constants — the distilled contract of the StructureDefinitions
 * served by the national Shared Health Record at
 * https://nshr-uat.sha.go.ke/fhir/StructureDefinition/.
 *
 * Every value below was verified against the live UAT server (HAPI FHIR 8.4.0,
 * FHIR R4B 4.3.0) on 2026-09-22, including an empirical `$validate` pass of the
 * exact bundle shape the mapper produces. Two families of artifacts live on
 * that server:
 *
 *  1. the Kenya Emergency Care IG (`em-*` / `ke-emergency-*` profiles) — the
 *     only resource profiles the SHA enforces, and therefore the shape every
 *     "visit closed" submission must take: a point-of-care Encounter
 *     (`em-poc-encounter`) hanging off an incident Encounter
 *     (`em-incident-encounter`), both tied to an EpisodeOfCare;
 *  2. the KE-SHR Care Technical Specification code systems (`kps*`), which
 *     define the clinical content vocabulary (client registration, clinical
 *     consultation, diagnostics, treatment, immunization, referral).
 *
 * Canonical-host caveat (see docs/shr-visit-submission.md, "SHR terminology"):
 * hosts differ per environment (nshr-uat.sha.go.ke in UAT, others in
 * production). Profile and code-system URLs are therefore built from
 * `shaCanonicalBase`, EXCEPT the `http://hie.go.ke/fhir/identifier/*` systems,
 * which the profiles fix verbatim via `fixedUri` and which are stable across
 * environments.
 */

import type { VisitSubmissionFamily } from './types';

/** The canonical host the UAT profiles are registered under. */
export const DEFAULT_SHA_FHIR_CANONICAL_BASE =
  'https://nshr-uat.sha.go.ke/fhir';

/** Profile canonical URLs, relative to `shaCanonicalBase`. */
export const SHA_PROFILE_PATHS = {
  /** The clinical visit itself — the anchor resource of a visit-closed bundle. */
  pocEncounter: '/StructureDefinition/em-poc-encounter',
  /**
   * The incident (dispatch) encounter the point-of-care encounter must
   * reference via `partOf`.
   */
  incidentEncounter: '/StructureDefinition/em-incident-encounter',
  /** Vitals — the only profiled Observation type routine AMRS data can fill. */
  vitalSignsObservation: '/StructureDefinition/em-vital-signs-observation',
  /** `ke-condition` (published under the internal name "MyConditionProfile"). */
  condition: '/StructureDefinition/ke-condition',
} as const;

/** Extension canonical paths, relative to `shaCanonicalBase`. */
export const SHA_EXTENSION_PATHS = {
  /**
   * Boolean flag required on BOTH the point-of-care Encounter (min = 1) and —
   * when the encounter says `true` — the referenced Patient, per invariant
   * `em-poc-2` ("When the point-of-care Encounter confirms patient identity,
   * the referenced Patient must also be marked as identity-verified").
   */
  patientIdentityVerified: '/StructureDefinition/em-patient-identity-verified',
  /** Caller complex extension, required on the incident encounter (min = 1). */
  incidentCaller: '/StructureDefinition/em-incident-caller',
} as const;

/**
 * Identifier systems the profiles fix with `fixedUri` — emitted verbatim, never
 * built from `shaCanonicalBase`. Confirmed by `$validate` slice discriminators.
 */
export const SHA_IDENTIFIER_SYSTEMS = {
  incidentId: 'http://hie.go.ke/fhir/identifier/incident-id',
  pocEncounterId: 'http://hie.go.ke/fhir/identifier/poc-encounter-id',
  dispatchId: 'http://hie.go.ke/fhir/identifier/dispatch-id',
} as const;

/** Code-system paths, relative to `shaCanonicalBase`. */
export const SHA_CODE_SYSTEM_PATHS = {
  /** Encounter.priority on the PoC encounter — REQUIRED binding, min = 1. */
  clinicalAcuity: '/CodeSystem/em-clinical-acuity',
  /** Encounter.priority on the incident encounter — REQUIRED binding, min = 1. */
  dispatchPriority: '/CodeSystem/em-dispatch-priority',
  /** Encounter.type on the incident encounter — REQUIRED binding, min = 1. */
  incidentType: '/CodeSystem/em-incident-type',
  /** Participant role pattern on the PoC encounter's single participant. */
  participantRole: '/CodeSystem/em-participant-role',
  /** Caller relationship codes inside the em-incident-caller extension. */
  callerRelationship: '/CodeSystem/em-caller-relationship',
} as const;

/**
 * v3-ActEncounterCode — the code system base FHIR binds `Encounter.class` to.
 * The emergency profile FIXES the class to FLD; the clinical family instead
 * picks it from the AMRS visit type, like OpenMRS FHIR2 does (AMB/IMP/…).
 */
export const V3_ACT_ENCOUNTER_CODE_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/v3-ActEncounterCode';

/** Fixed values the profiles pin — emitting anything else is a validation error. */
export const SHA_FIXED_VALUES = {
  /**
   * `Encounter.class` on em-poc-encounter is FIXED to v3-ActEncounterCode#FLD
   * ("Emergency medical services field response"). This deviates from standard
   * OpenMRS FHIR2, which maps visit types to AMB/IMP/etc. — the SHA profile
   * simply does not allow those here.
   */
  pocEncounterClass: {
    system: V3_ACT_ENCOUNTER_CODE_SYSTEM,
    code: 'FLD',
    display: 'Emergency medical services field response',
  },
} as const;

/**
 * Official v3-ActEncounterCode displays for the classes a clinical-family
 * Encounter may carry. Unknown configured codes fall back to the code itself.
 */
export const ENCOUNTER_CLASS_DISPLAYS: Record<string, string> = {
  AMB: 'ambulatory',
  EMER: 'emergency',
  FLD: 'Emergency medical services field response',
  HH: 'home health',
  IMP: 'inpatient encounter',
  NONAC: 'inpatient non-acute',
  PRENC: 'pre-admission',
  SS: 'short stay',
  VR: 'virtual',
};

/**
 * The class a clinical-family Encounter falls back to when its visit type is
 * not in `visitTypeClassMap` — ambulatory, the standard reading of an
 * outpatient visit. Override via `SHA_CLINICAL_ENCOUNTER_CLASS`.
 */
export const DEFAULT_CLINICAL_ENCOUNTER_CLASS = 'AMB';

/**
 * Default AMRS visit-type → v3-ActEncounterCode class mapping for the clinical
 * family. Empty by design: visit-type UUIDs are deployment-specific, so sites
 * opt in via `SHA_VISIT_TYPE_CLASS_MAP` (visit-type UUID → class code).
 */
export const DEFAULT_VISIT_TYPE_CLASS_MAP: Record<string, string> = {};

/**
 * The bundle family used when neither the request nor
 * `SHA_VISIT_TYPE_FAMILY_MAP` says otherwise. `emergency`, so existing
 * deployments keep the exact behaviour they had before the clinical family
 * existed; flip via `SHA_DEFAULT_SUBMISSION_FAMILY` once a site maps its
 * visit types.
 */
export const DEFAULT_SUBMISSION_FAMILY: VisitSubmissionFamily = 'emergency';

/** External (non-SHA-hosted) systems the bundle cites. */
export const EXTERNAL_SYSTEMS = {
  loinc: 'http://loinc.org',
  ucum: 'http://unitsofmeasure.org',
  hl7ObservationCategory:
    'http://terminology.hl7.org/CodeSystem/observation-category',
  hl7ConditionClinical:
    'http://terminology.hl7.org/CodeSystem/condition-clinical',
  hl7ConditionVerification:
    'http://terminology.hl7.org/CodeSystem/condition-ver-status',
  hl7DiagnosisRole: 'http://terminology.hl7.org/CodeSystem/diagnosis-role',
} as const;

/** Vital-sign LOINC codes drawn from the `em-vital-signs-vs` expansion. */
export const VITAL_SIGN_LOINC = {
  heartRate: '8867-4',
  respiratoryRate: '9279-1',
  bodyTemperature: '8310-5',
  oxygenSaturation: '59408-5',
  systolicBloodPressure: '8480-6',
  diastolicBloodPressure: '8462-4',
  meanArterialPressure: '8478-0',
  bodyWeight: '29463-7',
  bodyHeight: '8302-2',
  bodyMassIndex: '39156-5',
  headCircumference: '9843-4',
} as const;

/**
 * em-clinical-acuity codes → em-dispatch-priority codes. The PoC encounter's
 * acuity (required) and the incident encounter's dispatch priority (required)
 * describe the same case, so one lookup drives both.
 */
export const ACUITY_TO_DISPATCH_PRIORITY: Record<string, string> = {
  red: 'P1',
  orange: 'P1',
  yellow: 'P2',
  green: 'P3',
  blue: 'P4',
  black: 'P1',
  unknown: 'unknown',
};

/** Official display names, from the CodeSystems served by the SHA host. */
export const ACUITY_DISPLAYS: Record<string, string> = {
  red: 'Red - Immediate',
  orange: 'Orange - Very urgent',
  yellow: 'Yellow - Urgent',
  green: 'Green - Routine',
  blue: 'Blue - Non-urgent',
  black: 'Black - Deceased or expectant',
  unknown: 'Unknown',
};

export const DISPATCH_PRIORITY_DISPLAYS: Record<string, string> = {
  P1: 'Priority 1 – Immediate',
  P2: 'Priority 2 – Urgent',
  P3: 'Priority 3 – Non-urgent',
  P4: 'Priority 4 – Advice or scheduled response',
  unknown: 'Unknown',
};

export const INCIDENT_TYPE_DISPLAYS: Record<string, string> = {
  medical: 'Medical emergency',
  trauma: 'Trauma',
  obstetric: 'Obstetric emergency',
  paediatric: 'Paediatric emergency',
  'mental-health': 'Mental health emergency',
  'mass-casualty': 'Mass-casualty incident',
  fire: 'Fire-related incident',
  'road-traffic': 'Road traffic incident',
  'interfacility-transfer': 'Inter-facility transfer',
  other: 'Other emergency incident',
};

/** Participant-role display for the PoC encounter's required EMT participant. */
export const PARTICIPANT_ROLE_EMT = {
  code: 'emt',
  display: 'EMT / attending clinician',
} as const;

/**
 * OpenMRS encounter-diagnosis certainty → FHIR condition verification status
 * (bound to http://hl7.org/fhir/ValueSet/condition-ver-status, REQUIRED and
 * min = 1 on ke-condition).
 */
export const DIAGNOSIS_CERTAINTY_TO_VERIFICATION: Record<string, string> = {
  CONFIRMED: 'confirmed',
  PROVISIONAL: 'provisional',
};

/**
 * OpenMRS concept-mapping source names → FHIR coding system URLs, so diagnosis
 * and observation concepts carry real standard codes where AMRS mappings
 * exist. Unmapped sources fall back to `urn:amrs:concept-source:<name>`.
 * Mirrors the KE-SHR `knhts-code-systems-cs` source catalogue.
 */
export const CONCEPT_SOURCE_SYSTEM_URLS: Record<string, string> = {
  LOINC: 'http://loinc.org',
  SNOMED: 'http://snomed.info/sct',
  'SNOMED CT': 'http://snomed.info/sct',
  'ICD-10': 'http://hl7.org/fhir/sid/icd-10',
  'ICP-10': 'http://hl7.org/fhir/sid/icd-10',
  ICPC: 'http://hl7.org/fhir/sid/icpc-2',
  CIEL: 'https://openconceptlab.org/orgs/CIEL/sources/CIEL',
};

/**
 * Default AMRS vitals mapping: concept UUID → SHA vital-sign LOINC code +
 * UCUM unit. These concept UUIDs are the ones the AMRS deployment already
 * pins in its frontend config (`systolicBloodPressureUuid` …), so the
 * defaults are correct out of the box; sites override via
 * `SHA_VITAL_SIGNS_CONCEPT_MAP`.
 */
export const DEFAULT_VITAL_SIGNS_CONCEPT_MAP: Record<
  string,
  { loinc: string; unit: string; unitCode: string }
> = {
  '5085AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA': {
    loinc: VITAL_SIGN_LOINC.systolicBloodPressure,
    unit: 'mmHg',
    unitCode: 'mm[Hg]',
  },
  '5086AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA': {
    loinc: VITAL_SIGN_LOINC.diastolicBloodPressure,
    unit: 'mmHg',
    unitCode: 'mm[Hg]',
  },
  '5087AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA': {
    loinc: VITAL_SIGN_LOINC.heartRate,
    unit: 'beats/min',
    unitCode: '/min',
  },
  '5088AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA': {
    loinc: VITAL_SIGN_LOINC.bodyTemperature,
    unit: '°C',
    unitCode: 'Cel',
  },
  '5089AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA': {
    loinc: VITAL_SIGN_LOINC.bodyWeight,
    unit: 'kg',
    unitCode: 'kg',
  },
  '5090AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA': {
    loinc: VITAL_SIGN_LOINC.bodyHeight,
    unit: 'cm',
    unitCode: 'cm',
  },
  '5092AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA': {
    loinc: VITAL_SIGN_LOINC.oxygenSaturation,
    unit: '%',
    unitCode: '%',
  },
  '5242AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA': {
    loinc: VITAL_SIGN_LOINC.respiratoryRate,
    unit: 'breaths/min',
    unitCode: '/min',
  },
};

/**
 * Default acuity mapping: the AMRS queue-priority concept UUIDs →
 * em-clinical-acuity codes (EMERGENCY / NORMAL / NOT-URGENT priorities).
 */
export const DEFAULT_ACUITY_CONCEPT_MAP: Record<string, string> = {
  '8e86ff12-ec83-41e8-a534-bb410739d880': 'red', // EMERGENCY priority
  'bbd99c12-67e9-4381-8b4c-1f231e86f8e2': 'green', // NORMAL priority
  '26995049-fc00-43f4-a725-851fd517a1ac': 'blue', // NOT-URGENT priority
};

/**
 * Default OpenMRS patient-identifier type UUIDs this deployment uses for the
 * SHA identifier systems (the AMRS frontend pins the same UUIDs), and the
 * fixed SHA identifier systems each maps to. Override via the
 * `SHA_*_IDENTIFIER_TYPE_UUID` env keys.
 */
export const DEFAULT_PATIENT_IDENTIFIER_TYPES = {
  crNumber: 'e88dc246-3614-4ee3-8141-1f2a83054e72',
  upi: 'cba702b9-4664-4b43-83f1-9ab473cbd64d',
  nationalId: '58a47054-1359-11df-a1f1-0026b9348838',
  shaNumber: 'cf5362b2-8049-4442-b3c6-36f870e320cb',
  birthCertificate: '7924e13b-131a-4da8-8efa-e294184a1b0d',
} as const;

export const SHA_PATIENT_IDENTIFIER_SYSTEMS = {
  crNumber: 'http://hie.go.ke/fhir/identifier/cr-number',
  upi: 'http://hie.go.ke/fhir/identifier/upi',
  nationalId: 'http://hie.go.ke/fhir/identifier/national-id',
  shaNumber: 'http://hie.go.ke/fhir/identifier/sha-number',
  birthCertificate: 'http://hie.go.ke/fhir/identifier/birth-certificate',
} as const;

/** The Organization identifier system for the facility code. */
export const SHA_FACILITY_IDENTIFIER_SYSTEM =
  'http://hie.go.ke/fhir/identifier/facility-code';

/** The facility-code type DHA's middleware itself uses (`x-facility-id-type`). */
export const SHA_FACILITY_ID_TYPE = 'fr-code';

/** Default AMRS provenance URI stamped on `Bundle.meta.source`. */
export const DEFAULT_AMRS_SOURCE_URI = 'https://amrs.ampath.or.ke';

/** Default AMRS FHIR-ish system URLs for concepts and derived identifiers. */
export const DEFAULT_AMRS_CONCEPT_SYSTEM_URL =
  'https://amrs.ampath.or.ke/fhir/concept';
export const DEFAULT_AMRS_DERIVED_IDENTIFIER_SYSTEM =
  'https://amrs.ampath.or.ke/fhir/identifier/derived';
export const DEFAULT_AMRS_PRACTITIONER_IDENTIFIER_SYSTEM =
  'https://amrs.ampath.or.ke/fhir/provider';

/**
 * Diagnostics patterns identifying the KNOWN UAT terminology defect (see
 * docs/shr-visit-submission.md, "Known UAT terminology defect"): ValueSets
 * composed of `{ "system": "<url>" }` includes expand to zero codes on the UAT
 * server even though their CodeSystems are loaded and complete, so every code
 * drawn from em-clinical-acuity / em-dispatch-priority / em-incident-type (and
 * the drug, procedure and active-ingredient catalogues) reports as "not in the
 * value set". These issues are classified, reported, and — unless strict
 * validation is enabled — do not block submission.
 */
export const KNOWN_TERMINOLOGY_DEFECT_PATTERNS: RegExp[] = [
  /No codes in ValueSet belong to CodeSystem/i,
  /None of the codings provided are in the value set/i,
];
