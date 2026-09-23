/**
 * Shared fixtures for the shr visit-submission specs. Everything here is
 * synthetic — no real patient data — but shaped exactly like the OpenMRS REST
 * payloads the custom representations in openmrs-visit.client.ts request.
 */

import {
  DEFAULT_ACUITY_CONCEPT_MAP,
  DEFAULT_AMRS_CONCEPT_SYSTEM_URL,
  DEFAULT_AMRS_DERIVED_IDENTIFIER_SYSTEM,
  DEFAULT_AMRS_PRACTITIONER_IDENTIFIER_SYSTEM,
  DEFAULT_AMRS_SOURCE_URI,
  DEFAULT_CLINICAL_ENCOUNTER_CLASS,
  DEFAULT_PATIENT_IDENTIFIER_TYPES,
  DEFAULT_VITAL_SIGNS_CONCEPT_MAP,
  SHA_PATIENT_IDENTIFIER_SYSTEMS,
} from './sha-ig.constants';
import type {
  ClosedVisitContext,
  OpenMrsEncounter,
  OpenMrsPatient,
  OpenMrsVisit,
  ShrVisitBundleOptions,
} from './types';

/** The identifier-type UUIDs this deployment pins (sha-ig.constants.ts). */
export const CR_IDENTIFIER_TYPE_UUID =
  DEFAULT_PATIENT_IDENTIFIER_TYPES.crNumber;
export const UPI_IDENTIFIER_TYPE_UUID = DEFAULT_PATIENT_IDENTIFIER_TYPES.upi;

/** Queue-priority concept UUID (CIEL 1750 EMERGENCY). */
export const EMERGENCY_PRIORITY_CONCEPT_UUID =
  '8e86ff12-ec83-41e8-a534-bb410739d880';

/** Vitals concept UUIDs (CIEL 5085… — see sha-ig.constants.ts). */
export const SBP_CONCEPT_UUID = '5085AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
export const DBP_CONCEPT_UUID = '5086AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
export const PULSE_CONCEPT_UUID = '5087AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export const PATIENT_UUID = '0c70c8d2-3e52-4d5e-9a95-4df9b1f65c72';
export const VISIT_UUID = '5b6cbb56-8c07-4a11-8f14-9f5c8e5a8d99';
/** The fixture visit's type concept (see visitFixture). */
export const VISIT_TYPE_UUID = 'visit-type-1';
export const PROVIDER_UUID = 'da0e4f7a-6dc7-4d61-b6b3-9f1e2d3c4b5a';
export const LOCATION_UUID = 'location-1';
export const FACILITY_CODE = 'FID-27-114387-5';
export const FACILITY_NAME = 'AMRS Test Clinic';

/** Mapper options as ShrVisitSubmissionService builds them — defaults only. */
export function mapperOptionsFixture(
  overrides: Partial<ShrVisitBundleOptions> = {},
): ShrVisitBundleOptions {
  return {
    family: 'emergency',
    shaCanonicalBase: 'https://sha.test/fhir',
    amrsSourceUri: DEFAULT_AMRS_SOURCE_URI,
    amrsConceptSystemUrl: DEFAULT_AMRS_CONCEPT_SYSTEM_URL,
    amrsDerivedIdentifierSystem: DEFAULT_AMRS_DERIVED_IDENTIFIER_SYSTEM,
    amrsPractitionerIdentifierSystem:
      DEFAULT_AMRS_PRACTITIONER_IDENTIFIER_SYSTEM,
    patientIdentifierTypes: DEFAULT_PATIENT_IDENTIFIER_TYPES,
    patientIdentifierSystems: SHA_PATIENT_IDENTIFIER_SYSTEMS,
    vitalSignsConceptMap: DEFAULT_VITAL_SIGNS_CONCEPT_MAP,
    acuityConceptMap: DEFAULT_ACUITY_CONCEPT_MAP,
    incidentIdAttributeTypeUuid: '',
    dispatchIdAttributeTypeUuid: '',
    incidentTypeCode: 'medical',
    visitTypeClassMap: {},
    defaultEncounterClass: DEFAULT_CLINICAL_ENCOUNTER_CLASS,
    facility: { code: FACILITY_CODE, name: FACILITY_NAME },
    maxObservationsPerBundle: 500,
    maxBundleEntries: 1000,
    ...overrides,
  };
}

export function patientFixture(
  overrides: Partial<OpenMrsPatient> = {},
): OpenMrsPatient {
  return {
    uuid: PATIENT_UUID,
    identifiers: [
      {
        identifier: 'CR-123456',
        preferred: true,
        identifierType: {
          uuid: CR_IDENTIFIER_TYPE_UUID,
          display: 'Chronical Random',
        },
      },
      {
        identifier: 'UPI-98765',
        identifierType: {
          uuid: UPI_IDENTIFIER_TYPE_UUID,
          display: 'Unified Patient Identifier',
        },
      },
    ],
    person: {
      uuid: 'person-1',
      gender: 'M',
      birthdate: '1990-04-12T00:00:00+0300',
      dead: false,
      preferredName: {
        givenName: 'Test',
        middleName: 'A',
        familyName: 'Patient',
      },
    },
    ...overrides,
  };
}

export function visitFixture(
  overrides: Partial<OpenMrsVisit> = {},
): OpenMrsVisit {
  return {
    uuid: VISIT_UUID,
    visitType: { uuid: VISIT_TYPE_UUID, display: 'Facility Visit' },
    location: { uuid: LOCATION_UUID, display: FACILITY_NAME },
    patient: { uuid: PATIENT_UUID },
    startDatetime: '2026-09-01T09:00:00+0300',
    stopDatetime: '2026-09-01T11:30:00+0300',
    attributes: [],
    ...overrides,
  };
}

export function encounterFixture(
  overrides: Partial<OpenMrsEncounter> = {},
): OpenMrsEncounter {
  return {
    uuid: 'encounter-1',
    encounterDatetime: '2026-09-01T09:15:00+0300',
    encounterType: { uuid: 'enc-type-1', display: 'Consultation' },
    location: { uuid: LOCATION_UUID, display: FACILITY_NAME },
    visit: { uuid: VISIT_UUID },
    encounterProviders: [
      {
        uuid: 'enc-provider-1',
        provider: { uuid: PROVIDER_UUID, display: 'Dr Test Provider' },
      },
    ],
    diagnoses: [
      {
        uuid: 'diagnosis-1',
        rank: 1,
        certainty: 'CONFIRMED',
        diagnosis: {
          coded: {
            uuid: 'concept-diagnosis-1',
            display: 'Malaria, unspecified',
            datatype: { display: 'N/A' },
            mappings: [
              {
                conceptMapType: { display: 'SAME-AS' },
                conceptReferenceTerm: {
                  code: 'B54',
                  conceptSource: { name: 'ICD-10' },
                },
              },
            ],
          },
          nonCoded: null,
        },
      },
      {
        uuid: 'diagnosis-2',
        rank: 2,
        certainty: 'PROVISIONAL',
        diagnosis: {
          coded: null,
          nonCoded: 'Suspected typhoid',
        },
      },
    ],
    obs: [
      {
        uuid: 'obs-sbp-1',
        obsDatetime: '2026-09-01T09:20:00+0300',
        concept: {
          uuid: SBP_CONCEPT_UUID,
          display: 'SYSTOLIC BP',
          datatype: { display: 'Numeric' },
          mappings: [],
        },
        valueNumeric: 120,
      },
      {
        uuid: 'obs-priority-1',
        obsDatetime: '2026-09-01T09:05:00+0300',
        concept: {
          uuid: EMERGENCY_PRIORITY_CONCEPT_UUID,
          display: 'EMERGENCY',
          datatype: { display: 'Coded' },
          mappings: [],
        },
        valueCoded: { uuid: 'concept-emergency', display: 'EMERGENCY' },
      },
      {
        // No value — must be skipped with a warning, never emitted empty.
        uuid: 'obs-empty-1',
        obsDatetime: '2026-09-01T09:25:00+0300',
        concept: {
          uuid: 'concept-void-me',
          display: 'Some concept',
          mappings: [],
        },
        voided: false,
      },
    ],
    ...overrides,
  };
}

/** A group member obs (e.g. BP panel) — only the members carry values. */
export function groupedVitalsFixture(): OpenMrsEncounter['obs'] {
  return [
    {
      uuid: 'obs-vitals-group-1',
      obsDatetime: '2026-09-01T10:00:00+0300',
      concept: {
        uuid: 'concept-vitals-group',
        display: 'VITALS',
        mappings: [],
      },
      groupMembers: [
        {
          uuid: 'obs-dbp-1',
          obsDatetime: '2026-09-01T10:00:00+0300',
          concept: {
            uuid: DBP_CONCEPT_UUID,
            display: 'DIASTOLIC BP',
            mappings: [],
          },
          valueNumeric: 80,
        },
        {
          uuid: 'obs-voided-member-1',
          voided: true,
          obsDatetime: '2026-09-01T10:00:00+0300',
          concept: { uuid: PULSE_CONCEPT_UUID, display: 'PULSE', mappings: [] },
          valueNumeric: 72,
        },
      ],
    },
  ];
}

/** The full assembled context for one closed visit (what fetchClosedVisitContext returns). */
export function closedVisitContextFixture(): ClosedVisitContext {
  const encounter = encounterFixture();
  return {
    patient: patientFixture(),
    visit: visitFixture(),
    encounters: [
      encounter,
      {
        ...encounterFixture(),
        uuid: 'encounter-2',
        obs: groupedVitalsFixture(),
        diagnoses: [],
      },
    ],
  };
}

/** A minimal valid JSON Response for the global fetch mock. */
export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
