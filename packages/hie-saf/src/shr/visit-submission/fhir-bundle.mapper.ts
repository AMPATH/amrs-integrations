/**
 * OpenMRS → FHIR R4B bundle mapper — the transform step of
 * `POST /shr/visit-submission`: "Turn the retrieved clinical data into a FHIR
 * Bundle that strictly complies with the SHA FHIR IG."
 *
 * The SHA FHIR IG (served at https://nshr-uat.sha.go.ke/fhir/StructureDefinition/)
 * defines no generic outpatient profile — the only Encounter profiles it
 * enforces are the Kenya Emergency Care ones — so the mapper emits one of two
 * bundle FAMILIES, selected by ShrVisitSubmissionService from the request and
 * the AMRS visit type (see types.ts and docs/shr-visit-submission.md §5):
 *
 *   emergency (default)
 *     Patient ──subject of──► PoC Encounter (em-poc-encounter)
 *                                │ partOf ▼          │ episodeOfCare ▼
 *     EpisodeOfCare ◄────── Incident Encounter (em-incident-encounter)
 *     Organization (serviceProvider, min 1) · Practitioner (participant, min 1)
 *     Condition[] (ke-condition) · Observation[] (em-vital-signs-observation +
 *     base R4B)
 *
 *   clinical — routine non-emergency care. Forcing such a visit into the
 *     emergency shape would misrecord it as an EMS field response (class FLD,
 *     EMT participant role, dispatch ids, triage acuity), so this family emits
 *     one base-R4B Encounter — conformant, because the IG only constrains
 *     resources that declare its profiles — with the class picked from the
 *     AMRS visit type (the OpenMRS FHIR2 mapping) and none of the emergency
 *     scaffolding:
 *
 *     Patient ──subject of──► Encounter (base R4B, class from visit type)
 *     Organization · Practitioner[] · Condition[] (ke-condition — the
 *     national, not emergency, condition profile) · Observation[]
 *     (em-vital-signs-observation for vitals — clinically generic — and base
 *     R4B for the rest)
 *
 * Every mandatory element of the enforced profiles is populated and was
 * verified against the live server with `$validate` (see sha-ig.constants.ts
 * for the constraint tables this mapping satisfies, and
 * docs/shr-visit-submission.md for the one UAT terminology defect no
 * conformant bundle validates cleanly today).
 *
 * The bundle is a FHIR **collection** — the envelope DHA's middleware demands
 * for `POST /shr/bundles` (see SubmitShrBundleDto; `id` is required, which the
 * deterministic UUIDv5 below satisfies). `urn:uuid` fullUrls are deterministic
 * (UUIDv5 of the source keys) and resources cross-reference each other through
 * them, so retries produce byte-identical bundles and DHA-side deduplication
 * and log-side diffing stay exact.
 */

import { createHash } from 'crypto';
import {
  ACUITY_DISPLAYS,
  ACUITY_TO_DISPATCH_PRIORITY,
  CONCEPT_SOURCE_SYSTEM_URLS,
  DIAGNOSIS_CERTAINTY_TO_VERIFICATION,
  DISPATCH_PRIORITY_DISPLAYS,
  ENCOUNTER_CLASS_DISPLAYS,
  EXTERNAL_SYSTEMS,
  INCIDENT_TYPE_DISPLAYS,
  PARTICIPANT_ROLE_EMT,
  SHA_CODE_SYSTEM_PATHS,
  SHA_EXTENSION_PATHS,
  SHA_FACILITY_ID_TYPE,
  SHA_FACILITY_IDENTIFIER_SYSTEM,
  SHA_FIXED_VALUES,
  SHA_IDENTIFIER_SYSTEMS,
  SHA_PROFILE_PATHS,
  V3_ACT_ENCOUNTER_CODE_SYSTEM,
} from './sha-ig.constants';
import {
  ClosedVisitContext,
  FhirBundle,
  FhirBundleEntry,
  FhirCodeableConcept,
  FhirCoding,
  FhirIdentifier,
  FhirReference,
  MissingPreconditionError,
  OpenMrsConcept,
  OpenMrsEncounter,
  OpenMrsObs,
  OpenMrsVisit,
  ShrVisitBundleBuild,
  ShrVisitBundleOptions,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deterministic UUIDv5 (RFC 4122) under the standard URL namespace, so each
 * source record maps to the same `urn:uuid` across retries — `$validate`
 * requires real lowercase UUIDs in `fullUrl`, and stability makes bundles
 * diffable and resubmission recognisable.
 */
export function deterministicUuid(name: string): string {
  const hash = createHash('sha1');
  hash.update(Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex')); // NAMESPACE_URL
  hash.update(Buffer.from(name, 'utf8'));
  const bytes = hash.digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC variant
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Normalize an OpenMRS datetime to a FHIR dateTime. OpenMRS emits offsets
 * without the colon ("+0300"); FHIR's xs:dateTime requires "+03:00".
 */
export function toFhirDateTime(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  return Number.isNaN(Date.parse(normalized)) ? undefined : normalized;
}

/**
 * Extract a visit attribute's string value (attributes carry strings, Concept
 * objects or refs) — used for the incident/dispatch identifiers when the
 * deployment records them on the visit.
 */
export function visitAttributeValue(
  visit: OpenMrsVisit,
  attributeTypeUuid: string,
): string | undefined {
  if (!attributeTypeUuid || !visit.attributes) {
    return undefined;
  }
  const attribute = visit.attributes.find(
    (attr) => attr.attributeType?.uuid === attributeTypeUuid,
  );
  if (!attribute) {
    return undefined;
  }
  if (
    typeof attribute.valueReference === 'string' &&
    attribute.valueReference
  ) {
    return attribute.valueReference;
  }
  if (typeof attribute.value === 'string' && attribute.value) {
    return attribute.value;
  }
  // Coded attributes arrive as Concept objects — the display is the usable value.
  if (attribute.value && typeof attribute.value === 'object') {
    const display = (attribute.value as { display?: string }).display;
    return typeof display === 'string' && display ? display : undefined;
  }
  return undefined;
}

/**
 * Concept codings for any AMRS concept: its standard mappings first, then the
 * AMRS concept itself.
 */
function conceptCodings(
  concept: OpenMrsConcept | null | undefined,
  options: ShrVisitBundleOptions,
): FhirCodeableConcept {
  if (!concept) {
    return {};
  }
  const codings: FhirCoding[] = [];
  const seen = new Set<string>();
  for (const mapping of concept.mappings ?? []) {
    const source = mapping.conceptReferenceTerm?.conceptSource?.name;
    const code = mapping.conceptReferenceTerm?.code;
    if (!source || !code) {
      continue;
    }
    // Same-source "SAME-AS"/"NARROWER-THAN" terms are interchangeable for our use.
    const system =
      CONCEPT_SOURCE_SYSTEM_URLS[source] ?? `urn:amrs:concept-source:${source}`;
    const key = `${system}|${code}`;
    if (!seen.has(key)) {
      seen.add(key);
      codings.push({ system, code, display: concept.display });
    }
  }
  const amrsKey = `${options.amrsConceptSystemUrl}|${concept.uuid}`;
  if (!seen.has(amrsKey)) {
    codings.push({
      system: options.amrsConceptSystemUrl,
      code: concept.uuid,
      display: concept.display,
    });
  }
  return {
    coding: codings,
    ...(concept.display ? { text: concept.display } : {}),
  };
}

/** The mapper's derived-identifier helper — one per generated clinical resource. */
function derivedIdentifier(
  options: ShrVisitBundleOptions,
  key: string,
): FhirIdentifier {
  return { system: options.amrsDerivedIdentifierSystem, value: key };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bundle assembly
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Everything the two families build identically: the patient's SHA identity,
 * the participating providers, the clamped period, the shared urn:uuid
 * references and the entry/stat/warning plumbing. Only the encounter
 * scaffolding differs between the families.
 */
interface SharedBundleParts {
  patient: ClosedVisitContext['patient'];
  visit: OpenMrsVisit;
  sha: (path: string) => string;
  warnings: string[];
  stats: Record<string, number>;
  entries: FhirBundleEntry[];
  patientIdentifiers: FhirIdentifier[];
  identityVerified: boolean;
  /** encounterProviders across the visit, deduplicated, newest encounter first. */
  providers: Map<string, { uuid: string; display?: string }>;
  periodStart?: string;
  periodEnd?: string;
  patientFullUrl: string;
  organizationFullUrl: string;
  practitionerFullUrls: Map<string, string>;
  referenceTo: (fullUrl: string, display?: string) => FhirReference;
  push: (fullUrl: string, resource: Record<string, unknown>) => void;
}

function prepareSharedParts(
  context: ClosedVisitContext,
  options: ShrVisitBundleOptions,
): SharedBundleParts {
  const { patient, visit, encounters } = context;
  if (!visit) {
    // Unreachable via the service (a null visit is a "skipped" outcome, not a
    // build), but the mapper refuses to run without one.
    throw new MissingPreconditionError(
      'Cannot build a bundle without a closed visit.',
    );
  }
  const warnings: string[] = [];
  const sha = (path: string): string => `${options.shaCanonicalBase}${path}`;
  const stats: Record<string, number> = {};

  // ── Patient identity ────────────────────────────────────────────────────────
  // The SHA resolves patients by national identifiers. The CR number is the
  // primary one in this deployment (the claims flow's patientId IS the CR
  // number); the UPI is the SHR's own unique id.
  const identifierPairs: Array<{ typeUuid: string; system: string }> = [
    {
      typeUuid: options.patientIdentifierTypes.crNumber,
      system: options.patientIdentifierSystems.crNumber,
    },
    {
      typeUuid: options.patientIdentifierTypes.upi,
      system: options.patientIdentifierSystems.upi,
    },
    {
      typeUuid: options.patientIdentifierTypes.nationalId,
      system: options.patientIdentifierSystems.nationalId,
    },
    {
      typeUuid: options.patientIdentifierTypes.shaNumber,
      system: options.patientIdentifierSystems.shaNumber,
    },
    {
      typeUuid: options.patientIdentifierTypes.birthCertificate,
      system: options.patientIdentifierSystems.birthCertificate,
    },
  ];
  const patientIdentifiers: FhirIdentifier[] = [];
  for (const pair of identifierPairs) {
    const match = (patient.identifiers ?? []).find(
      (id) => id.identifierType?.uuid === pair.typeUuid,
    );
    if (match?.identifier) {
      patientIdentifiers.push({
        use: 'official',
        system: pair.system,
        value: match.identifier,
      });
    }
  }
  const crNumber = patientIdentifiers.find(
    (id) => id.system === options.patientIdentifierSystems.crNumber,
  )?.value;
  const upi = patientIdentifiers.find(
    (id) => id.system === options.patientIdentifierSystems.upi,
  )?.value;
  // The identity-verified extension is emergency-IG vocabulary on the Encounter
  // (invariant em-poc-2 mirrors it), but the identity assertion itself is a
  // SHR-wide fact — both families carry it on the Patient.
  const identityVerified = Boolean(crNumber || upi);
  if (!identityVerified) {
    warnings.push(
      'Patient has no CR number or UPI identifier — identity cannot be marked as verified; the SHR may reject the submission.',
    );
  }

  // ── Practitioners ───────────────────────────────────────────────────────────
  const orderedEncounters = [...encounters].sort(
    (a, b) =>
      Date.parse(b.encounterDatetime ?? '') -
      Date.parse(a.encounterDatetime ?? ''),
  );
  const providers = new Map<string, { uuid: string; display?: string }>();
  for (const encounter of orderedEncounters) {
    for (const entry of encounter.encounterProviders ?? []) {
      if (entry.provider?.uuid && !providers.has(entry.provider.uuid)) {
        providers.set(entry.provider.uuid, {
          uuid: entry.provider.uuid,
          display: entry.provider.display,
        });
      }
    }
  }

  // ── Period (em-poc-1 / em-incident-1: end must not precede start) ───────────
  const periodStart = toFhirDateTime(visit.startDatetime);
  let periodEnd = toFhirDateTime(visit.stopDatetime);
  if (
    periodStart &&
    periodEnd &&
    Date.parse(periodEnd) < Date.parse(periodStart)
  ) {
    warnings.push(
      'Visit stopDatetime precedes startDatetime — clamped to preserve the IG period ordering.',
    );
    periodEnd = periodStart;
  }

  // ── Shared references ──────────────────────────────────────────────────────
  const patientFullUrl = `urn:uuid:${deterministicUuid(`${options.amrsSourceUri}/fhir/Patient/${patient.uuid}`)}`;
  const organizationFullUrl = `urn:uuid:${deterministicUuid(`${options.amrsSourceUri}/fhir/Organization/${options.facility.code}`)}`;
  const practitionerFullUrls = new Map(
    [...providers.keys()].map((uuid) => [
      uuid,
      `urn:uuid:${deterministicUuid(`${options.amrsSourceUri}/fhir/Practitioner/${uuid}`)}`,
    ]),
  );

  const entries: FhirBundleEntry[] = [];
  const push = (fullUrl: string, resource: Record<string, unknown>): void => {
    if (entries.length >= options.maxBundleEntries) {
      warnings.push(
        `Bundle entry cap reached (${options.maxBundleEntries}) — remaining resources were not included.`,
      );
      return;
    }
    const resourceType = resource.resourceType as string;
    stats[resourceType] = (stats[resourceType] ?? 0) + 1;
    entries.push({
      fullUrl,
      resource: resource as FhirBundleEntry['resource'],
    });
  };
  const referenceTo = (fullUrl: string, display?: string): FhirReference => ({
    reference: fullUrl,
    ...(display ? { display } : {}),
  });

  return {
    patient,
    visit,
    sha,
    warnings,
    stats,
    entries,
    patientIdentifiers,
    identityVerified,
    providers,
    periodStart,
    periodEnd,
    patientFullUrl,
    organizationFullUrl,
    practitionerFullUrls,
    referenceTo,
    push,
  };
}

// ── 1. Patient ─────────────────────────────────────────────────────────────────
function pushPatient(parts: SharedBundleParts): void {
  const { patient } = parts;
  const preferredName = patient.person?.preferredName;
  const given = [preferredName?.givenName, preferredName?.middleName].filter(
    (part): part is string => Boolean(part),
  );
  const gender =
    patient.person?.gender === 'M'
      ? 'male'
      : patient.person?.gender === 'F'
        ? 'female'
        : undefined;
  parts.push(parts.patientFullUrl, {
    resourceType: 'Patient',
    ...(parts.identityVerified
      ? {
          extension: [
            {
              url: parts.sha(SHA_EXTENSION_PATHS.patientIdentityVerified),
              valueBoolean: true,
            },
          ],
        }
      : {}),
    ...(parts.patientIdentifiers.length
      ? { identifier: parts.patientIdentifiers }
      : {}),
    ...(given.length || preferredName?.familyName
      ? {
          name: [
            {
              ...(given.length ? { given } : {}),
              ...(preferredName?.familyName
                ? { family: preferredName.familyName }
                : {}),
            },
          ],
        }
      : {}),
    ...(gender ? { gender } : {}),
    ...(patient.person?.birthdate
      ? { birthDate: patient.person.birthdate.slice(0, 10) }
      : {}),
  });
}

// ── 2. Organization (Encounter.serviceProvider) ────────────────────────────────
function pushOrganization(
  parts: SharedBundleParts,
  options: ShrVisitBundleOptions,
): void {
  const organizationIdentifier: FhirIdentifier = {
    system: SHA_FACILITY_IDENTIFIER_SYSTEM,
    value: options.facility.code,
    type: { text: SHA_FACILITY_ID_TYPE },
  };
  parts.push(parts.organizationFullUrl, {
    resourceType: 'Organization',
    identifier: [organizationIdentifier],
    name:
      options.facility.name ||
      parts.visit.location?.display ||
      options.facility.code,
    active: true,
  });
}

// ── 3. Practitioner(s) (Encounter.participant.individual) ──────────────────────
function pushPractitioners(
  parts: SharedBundleParts,
  options: ShrVisitBundleOptions,
): void {
  for (const [uuid, provider] of parts.providers) {
    const identifier = {
      system: options.amrsPractitionerIdentifierSystem,
      value: uuid,
    };
    parts.push(parts.practitionerFullUrls.get(uuid)!, {
      resourceType: 'Practitioner',
      identifier: [identifier],
      name: provider.display ? [{ text: provider.display }] : undefined,
      active: true,
    });
  }
}

/** `Encounter.diagnosis` from the mapper's condition refs — undefined when the visit carries no diagnosis. */
function diagnosisList(
  diagnosisEntries: Array<{ conditionRef: FhirReference; rank?: number }>,
):
  | Array<{
      condition: FhirReference;
      use: { coding: FhirCoding[] };
      rank?: number;
    }>
  | undefined {
  return diagnosisEntries.length
    ? diagnosisEntries.map((diagnosis) => ({
        condition: diagnosis.conditionRef,
        use: {
          coding: [{ system: EXTERNAL_SYSTEMS.hl7DiagnosisRole, code: 'DD' }],
        },
        ...(diagnosis.rank ? { rank: diagnosis.rank } : {}),
      }))
    : undefined;
}

/**
 * Build the SHA-IG-compliant collection bundle for one closed visit, in the
 * family the service resolved.
 *
 * @param context  The patient, the closed visit (must be non-null — the service
 *                 handles the "no closed visit" outcome before mapping), and
 *                 the visit's encounters with obs/diagnoses/providers inline.
 * @param options  Site-specific mapping options (family, SHA canonical base,
 *                 concept maps, identifier systems, the resolved facility).
 * @throws MissingPreconditionError when the AMRS data cannot satisfy a
 *         mandatory IG element (emergency family only, today: no encounter
 *         provider — the PoC profile requires at least one participant).
 */
export function buildShrVisitBundle(
  context: ClosedVisitContext,
  options: ShrVisitBundleOptions,
): ShrVisitBundleBuild {
  return options.family === 'clinical'
    ? buildClinicalVisitBundle(context, options)
    : buildEmergencyVisitBundle(context, options);
}

// ─────────────────────────────────────────────────────────────────────────────
// The emergency family
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The Kenya Emergency Care IG shape: one PoC encounter (the visit) hanging
 * off one incident encounter, both tied to an EpisodeOfCare, with the
 * incident/dispatch identifiers, triage acuity and EMT participant role the
 * profiles demand. Every constraint below was `$validate`-verified on UAT.
 */
function buildEmergencyVisitBundle(
  context: ClosedVisitContext,
  options: ShrVisitBundleOptions,
): ShrVisitBundleBuild {
  const parts = prepareSharedParts(context, options);
  const { visit, warnings } = parts;

  // Practitioner: Encounter.participant is min = 1 on the PoC profile.
  if (parts.providers.size === 0) {
    throw new MissingPreconditionError(
      'No encounter provider found on the closed visit — the SHA PoC Encounter profile requires at least one participant.',
    );
  }

  // ── Incident linkage ────────────────────────────────────────────────────────
  const incidentId =
    visitAttributeValue(visit, options.incidentIdAttributeTypeUuid) ||
    visit.uuid;
  const dispatchId =
    visitAttributeValue(visit, options.dispatchIdAttributeTypeUuid) ||
    `${visit.uuid}-dispatch`;

  // ── Clinical acuity ─────────────────────────────────────────────────────────
  // Encounter.priority is REQUIRED on both profiles. Scan the visit's
  // observations for a configured triage/queue priority concept; fall back to
  // `unknown`, which is a legal em-clinical-acuity code.
  let acuity = 'unknown';
  let acuityAt = Number.NEGATIVE_INFINITY;
  for (const encounter of context.encounters) {
    for (const obs of flattenObservations(encounter.obs ?? [])) {
      const mapped = obs.concept?.uuid
        ? options.acuityConceptMap[obs.concept.uuid]
        : undefined;
      if (mapped) {
        // Parsed-time comparison: OpenMRS offsets (+0300) make lexical
        // comparison unreliable across sources.
        const at = Date.parse(
          obs.obsDatetime ?? encounter.encounterDatetime ?? '',
        );
        if (Number.isNaN(at) || at >= acuityAt) {
          acuity = mapped;
          acuityAt = at;
        }
      }
    }
  }
  if (acuity === 'unknown') {
    warnings.push(
      'No triage/queue priority observation found — Encounter.priority defaulted to "unknown".',
    );
  }
  const dispatchPriority = ACUITY_TO_DISPATCH_PRIORITY[acuity] ?? 'unknown';

  // ── Emergency-scaffolding references ────────────────────────────────────────
  // The incident id defaults to the visit uuid when no visit attribute carries
  // a real one — and the incident encounter must still not share the PoC
  // encounter's fullUrl (base Bundle invariant bdl-7: fullUrls are unique, and
  // HAPI flags every reference to a duplicated fullUrl as a multiple match), so
  // its derivation key is told apart from the visit's. The identifier VALUE
  // still carries the incident id verbatim (em-incident-2).
  const incidentKey =
    incidentId === visit.uuid ? `incident-${incidentId}` : incidentId;
  if (incidentKey !== incidentId) {
    warnings.push(
      'No incident id on the visit (SHA_INCIDENT_ID_ATTRIBUTE_TYPE_UUID unset or absent) — the incident encounter is keyed distinctly from the visit. ' +
        'Configure the attribute for real incident linkage.',
    );
  }
  const episodeFullUrl = `urn:uuid:${deterministicUuid(`${options.amrsSourceUri}/fhir/EpisodeOfCare/${incidentId}`)}`;
  const incidentEncounterFullUrl = `urn:uuid:${deterministicUuid(`${options.amrsSourceUri}/fhir/Encounter/${incidentKey}`)}`;
  // The visit itself as an Encounter. The clinical family derives the SAME
  // fullUrl for its Encounter — both families address the visit identically.
  const pocEncounterFullUrl = `urn:uuid:${deterministicUuid(`${options.amrsSourceUri}/fhir/Encounter/${visit.uuid}`)}`;

  pushPatient(parts);
  pushOrganization(parts, options);
  pushPractitioners(parts, options);

  // ── 4. EpisodeOfCare (min = 1 on BOTH Encounter profiles) ─────────────────────
  // em-incident-2: it must carry the same incident identifier as the encounters.
  const episodeIdentifier: FhirIdentifier = {
    system: SHA_IDENTIFIER_SYSTEMS.incidentId,
    value: incidentId,
  };
  parts.push(episodeFullUrl, {
    resourceType: 'EpisodeOfCare',
    identifier: [episodeIdentifier],
    status: 'finished',
    statusHistory: [
      {
        status: 'finished',
        period: { start: parts.periodStart, end: parts.periodEnd },
      },
    ],
    patient: parts.referenceTo(parts.patientFullUrl),
    ...(parts.periodStart || parts.periodEnd
      ? { period: { start: parts.periodStart, end: parts.periodEnd } }
      : {}),
    managingOrganization: parts.referenceTo(parts.organizationFullUrl),
  });

  // ── 5. Incident Encounter (em-incident-encounter) ────────────────────────────
  // The dispatch record the PoC encounter hangs off via `partOf`. For a
  // facility-initiated submission this is the intake case: caller = patient.
  parts.push(incidentEncounterFullUrl, {
    resourceType: 'Encounter',
    meta: { profile: [parts.sha(SHA_PROFILE_PATHS.incidentEncounter)] },
    // em-incident-caller (min = 1): individual + isPatient; the patient is
    // their own informant when the case starts at the facility.
    extension: [
      {
        url: parts.sha(SHA_EXTENSION_PATHS.incidentCaller),
        extension: [
          {
            url: 'individual',
            valueReference: parts.referenceTo(parts.patientFullUrl),
          },
          {
            url: 'relationship',
            valueCodeableConcept: {
              coding: [
                {
                  system: parts.sha(SHA_CODE_SYSTEM_PATHS.callerRelationship),
                  code: 'self',
                },
              ],
            },
          },
          { url: 'isPatient', valueBoolean: true },
        ],
      },
    ],
    // identifier min = 2, one dispatchId + one incidentId, systems fixed.
    identifier: [
      { system: SHA_IDENTIFIER_SYSTEMS.dispatchId, value: dispatchId },
      episodeIdentifier,
    ],
    status: 'finished',
    // class min = 1 on base R4, and em-incident-encounter does not relax it —
    // a live $validate flagged its absence twice (once per profile). FLD
    // ("field") is the fixed class this family's PoC encounter already uses;
    // the incident is the same field call, so it shares the constant.
    class: SHA_FIXED_VALUES.pocEncounterClass,
    // type min = 1, required binding to em-incident-type.
    type: [
      {
        coding: [
          {
            system: parts.sha(SHA_CODE_SYSTEM_PATHS.incidentType),
            code: options.incidentTypeCode,
            display:
              INCIDENT_TYPE_DISPLAYS[options.incidentTypeCode] ??
              options.incidentTypeCode,
          },
        ],
      },
    ],
    // priority min = 1, required binding to em-dispatch-priority.
    priority: {
      coding: [
        {
          system: parts.sha(SHA_CODE_SYSTEM_PATHS.dispatchPriority),
          code: dispatchPriority,
          display:
            DISPATCH_PRIORITY_DISPLAYS[dispatchPriority] ?? dispatchPriority,
        },
      ],
    },
    subject: parts.referenceTo(parts.patientFullUrl),
    episodeOfCare: [parts.referenceTo(episodeFullUrl)],
    // period min = 1 with BOTH start and end min = 1 — a closed visit has both.
    period: { start: parts.periodStart, end: parts.periodEnd },
    serviceProvider: parts.referenceTo(parts.organizationFullUrl),
    // partOf is 0..0 on this profile — the incident is the root of the chain.
  });

  // ── 6. PoC Encounter (em-poc-encounter) — the visit itself ───────────────────
  const diagnosisEntries: Array<{
    conditionRef: FhirReference;
    rank?: number;
  }> = [];
  const conditionEntries = buildConditionEntries(context.encounters, options, {
    sha: parts.sha,
    patientFullUrl: parts.patientFullUrl,
    encounterFullUrl: pocEncounterFullUrl,
    push: parts.push,
    diagnosisEntries,
    warnings: parts.warnings,
  });
  const diagnoses = diagnosisList(diagnosisEntries);

  parts.push(pocEncounterFullUrl, {
    resourceType: 'Encounter',
    meta: { profile: [parts.sha(SHA_PROFILE_PATHS.pocEncounter)] },
    // em-patient-identity-verified (min = 1) — mirrored on the Patient above.
    extension: [
      {
        url: parts.sha(SHA_EXTENSION_PATHS.patientIdentityVerified),
        valueBoolean: parts.identityVerified,
      },
    ],
    identifier: [
      episodeIdentifier, // incidentId slice (min = 1), system fixed.
      { system: SHA_IDENTIFIER_SYSTEMS.pocEncounterId, value: visit.uuid },
    ],
    status: 'finished',
    // class is FIXED to v3-ActEncounterCode#FLD by the profile — not a choice.
    class: SHA_FIXED_VALUES.pocEncounterClass,
    // priority min = 1, required binding to em-clinical-acuity.
    priority: {
      coding: [
        {
          system: parts.sha(SHA_CODE_SYSTEM_PATHS.clinicalAcuity),
          code: acuity,
          display: ACUITY_DISPLAYS[acuity] ?? acuity,
        },
      ],
    },
    subject: parts.referenceTo(parts.patientFullUrl),
    episodeOfCare: [parts.referenceTo(episodeFullUrl)],
    // participant min = 1; the profile fixes the role coding to emt
    // ("EMT / attending clinician"), which is also how the PoC profile
    // labels the treating clinician at the facility.
    participant: [...parts.providers.entries()].map(([uuid, provider]) => ({
      type: [
        {
          coding: [
            {
              system: parts.sha(SHA_CODE_SYSTEM_PATHS.participantRole),
              code: PARTICIPANT_ROLE_EMT.code,
              display: PARTICIPANT_ROLE_EMT.display,
            },
          ],
        },
      ],
      individual: parts.referenceTo(
        parts.practitionerFullUrls.get(uuid)!,
        provider.display,
      ),
    })),
    ...(parts.periodStart || parts.periodEnd
      ? { period: { start: parts.periodStart, end: parts.periodEnd } }
      : {}),
    ...(diagnoses ? { diagnosis: diagnoses } : {}),
    serviceProvider: parts.referenceTo(parts.organizationFullUrl),
    partOf: parts.referenceTo(incidentEncounterFullUrl), // min = 1
  });

  // Conditions reference the PoC encounter, so their fullUrls are already
  // registered — emit them right after it for a readable bundle.
  for (const condition of conditionEntries) {
    parts.push(condition.fullUrl, condition.resource);
  }

  // ── 7. Observations (em-vital-signs-observation + base R4B) ──────────────────
  buildObservationEntries(context.encounters, options, {
    sha: parts.sha,
    patientFullUrl: parts.patientFullUrl,
    encounterFullUrl: pocEncounterFullUrl,
    push: parts.push,
    warnings: parts.warnings,
  });

  return finishBundle(parts, options, { incidentId });
}

// ─────────────────────────────────────────────────────────────────────────────
// The clinical family
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Routine non-emergency care as a base-R4B Encounter: no em-* profile, no
 * incident/EpisodeOfCare scaffolding, no dispatch identifiers, no triage
 * acuity, no EMT participant role — none of which base R4 requires. The
 * `Encounter.class` comes from the AMRS visit type (AMB/IMP/…, the OpenMRS
 * FHIR2 mapping), the visit type rides along as `Encounter.type` coding, and
 * the clinical content keeps the same profiles as the emergency family:
 * `ke-condition` (national, not emergency) and
 * `em-vital-signs-observation` (clinically generic).
 */
function buildClinicalVisitBundle(
  context: ClosedVisitContext,
  options: ShrVisitBundleOptions,
): ShrVisitBundleBuild {
  const parts = prepareSharedParts(context, options);
  const { visit } = parts;
  // Same derivation as the emergency family's PoC encounter: this IS the
  // visit, as an Encounter.
  const encounterFullUrl = `urn:uuid:${deterministicUuid(`${options.amrsSourceUri}/fhir/Encounter/${visit.uuid}`)}`;

  pushPatient(parts);
  pushOrganization(parts, options);
  pushPractitioners(parts, options);

  // Conditions reference the encounter, so build them before it is pushed.
  const diagnosisEntries: Array<{
    conditionRef: FhirReference;
    rank?: number;
  }> = [];
  const conditionEntries = buildConditionEntries(context.encounters, options, {
    sha: parts.sha,
    patientFullUrl: parts.patientFullUrl,
    encounterFullUrl,
    push: parts.push,
    diagnosisEntries,
    warnings: parts.warnings,
  });
  const diagnoses = diagnosisList(diagnosisEntries);

  // Encounter.class from the AMRS visit type — v3-ActEncounterCode, the code
  // system base R4 binds the field to.
  const classCode =
    options.visitTypeClassMap[visit.visitType?.uuid ?? ''] ??
    options.defaultEncounterClass;

  parts.push(encounterFullUrl, {
    resourceType: 'Encounter',
    // The visit's own id under the AMRS-derived system — not the emergency
    // IG's poc-encounter-id, which routine care has no claim to.
    identifier: [derivedIdentifier(options, `visit-${visit.uuid}`)],
    status: 'finished',
    class: {
      system: V3_ACT_ENCOUNTER_CODE_SYSTEM,
      code: classCode,
      display: ENCOUNTER_CLASS_DISPLAYS[classCode] ?? classCode,
    },
    // The AMRS visit type, losslessly — its own coding, not a translated one.
    ...(visit.visitType?.uuid
      ? { type: [conceptCodings(visit.visitType, options)] }
      : {}),
    subject: parts.referenceTo(parts.patientFullUrl),
    // Base R4 requires no participant and fixes no role — the emergency IG's
    // EMT coding stays out of routine care.
    ...(parts.providers.size
      ? {
          participant: [...parts.providers.entries()].map(
            ([uuid, provider]) => ({
              individual: parts.referenceTo(
                parts.practitionerFullUrls.get(uuid)!,
                provider.display,
              ),
            }),
          ),
        }
      : {}),
    ...(parts.periodStart || parts.periodEnd
      ? { period: { start: parts.periodStart, end: parts.periodEnd } }
      : {}),
    ...(diagnoses ? { diagnosis: diagnoses } : {}),
    serviceProvider: parts.referenceTo(parts.organizationFullUrl),
  });

  // Conditions reference the encounter — emit them right after it, exactly
  // like the emergency family does after its PoC encounter.
  for (const condition of conditionEntries) {
    parts.push(condition.fullUrl, condition.resource);
  }

  // Observations: identical tiers to the emergency family (vitals under
  // em-vital-signs-observation, the rest base R4B), pointing at the
  // clinical encounter.
  buildObservationEntries(context.encounters, options, {
    sha: parts.sha,
    patientFullUrl: parts.patientFullUrl,
    encounterFullUrl,
    push: parts.push,
    warnings: parts.warnings,
  });

  return finishBundle(parts, options, {});
}

/** The collection envelope and build result both families share. */
function finishBundle(
  parts: SharedBundleParts,
  options: ShrVisitBundleOptions,
  extras: { incidentId?: string },
): ShrVisitBundleBuild {
  const { visit } = parts;
  // The bundle represents the visit as of its closure, so both timestamps are
  // the closure instant — retries then produce byte-identical bundles (stable
  // ids, fullUrls AND timestamps).
  const asOf = parts.periodEnd ?? new Date().toISOString();
  const bundle: FhirBundle = {
    resourceType: 'Bundle',
    // DHA's middleware requires Bundle.id; stable per visit, closure instant
    // AND family — the two families are different representations of the
    // same visit, so each stays distinguishable. A re-closed visit (a
    // corrected stopDatetime) also yields a new, distinguishable id.
    id: deterministicUuid(
      `${options.amrsSourceUri}/fhir/Bundle/${visit.uuid}|${visit.stopDatetime ?? ''}|${options.family}`,
    ),
    meta: {
      source: options.amrsSourceUri,
      lastUpdated: asOf,
    },
    type: 'collection',
    timestamp: asOf,
    entry: parts.entries,
  };

  return {
    bundle,
    warnings: parts.warnings,
    stats: parts.stats,
    family: options.family,
    identityVerified: parts.identityVerified,
    ...(extras.incidentId ? { incidentId: extras.incidentId } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Clinical entries
// ─────────────────────────────────────────────────────────────────────────────

interface EntryContext {
  sha: (path: string) => string;
  patientFullUrl: string;
  /**
   * The encounter the clinical content belongs to — the PoC encounter in the
   * emergency family, the visit encounter in the clinical family.
   */
  encounterFullUrl: string;
  push: (fullUrl: string, resource: Record<string, unknown>) => void;
  warnings: string[];
}

/**
 * Conditions from encounter diagnoses, against `ke-condition`, whose entire
 * differential is "make mandatory what base FHIR leaves optional":
 * subject, onsetDateTime, clinicalStatus, verificationStatus, recordedDate.
 */
function buildConditionEntries(
  encounters: OpenMrsEncounter[],
  options: ShrVisitBundleOptions,
  ctx: EntryContext & {
    diagnosisEntries: Array<{ conditionRef: FhirReference; rank?: number }>;
  },
): Array<{ fullUrl: string; resource: Record<string, unknown> }> {
  const built: Array<{ fullUrl: string; resource: Record<string, unknown> }> =
    [];
  const seenDiagnoses = new Set<string>();

  for (const encounter of encounters) {
    for (const diagnosis of encounter.diagnoses ?? []) {
      // The REST diagnosis uuid is the identity of this clinical statement.
      const diagnosisKey =
        diagnosis.uuid ??
        `${encounter.uuid}|${JSON.stringify(diagnosis.diagnosis ?? {})}`;
      if (seenDiagnoses.has(diagnosisKey)) {
        continue;
      }
      seenDiagnoses.add(diagnosisKey);

      const coded = diagnosis.diagnosis?.coded;
      const nonCoded =
        typeof diagnosis.diagnosis?.nonCoded === 'string'
          ? diagnosis.diagnosis.nonCoded
          : diagnosis.diagnosis?.nonCoded?.display;
      const code = coded
        ? conceptCodings(coded, options)
        : nonCoded
          ? { text: nonCoded }
          : null;
      if (!code) {
        continue; // A diagnosis with neither coded nor textual content cannot be expressed.
      }

      const certaintyDisplay =
        typeof diagnosis.certainty === 'string'
          ? diagnosis.certainty
          : diagnosis.certainty?.display;
      const verification =
        DIAGNOSIS_CERTAINTY_TO_VERIFICATION[
          (certaintyDisplay ?? '').toUpperCase()
        ] ?? 'confirmed';
      const recordedOn = toFhirDateTime(encounter.encounterDatetime);
      const identifier = derivedIdentifier(
        options,
        `diagnosis-${diagnosisKey}`,
      );
      const fullUrl = `urn:uuid:${deterministicUuid(`${options.amrsSourceUri}/fhir/Condition/${diagnosisKey}`)}`;
      const conditionRef = referenceFromFullUrl(
        fullUrl,
        coded?.display ?? nonCoded,
      );

      built.push({
        fullUrl,
        resource: {
          resourceType: 'Condition',
          meta: { profile: [ctx.sha(SHA_PROFILE_PATHS.condition)] },
          identifier: [identifier],
          clinicalStatus: {
            coding: [
              { system: EXTERNAL_SYSTEMS.hl7ConditionClinical, code: 'active' },
            ],
            text: 'Active',
          },
          verificationStatus: {
            coding: [
              {
                system: EXTERNAL_SYSTEMS.hl7ConditionVerification,
                code: verification,
              },
            ],
          },
          category: [
            {
              coding: [
                {
                  system:
                    'http://terminology.hl7.org/CodeSystem/condition-category',
                  code: 'problem-list-item',
                },
              ],
            },
          ],
          code,
          subject: { reference: ctx.patientFullUrl },
          encounter: { reference: ctx.encounterFullUrl },
          // onsetDateTime + recordedDate are min = 1 on ke-condition; the
          // encounter datetime is the best clinical instant available.
          onsetDateTime: recordedOn,
          recordedDate: recordedOn,
        },
      });
      ctx.diagnosisEntries.push({
        conditionRef,
        ...(diagnosis.rank ? { rank: diagnosis.rank } : {}),
      });
    }
  }
  return built;
}

/**
 * Walk an observation tree, yielding leaf obs (group parents are containers,
 * not values).
 */
function flattenObservations(obs: OpenMrsObs[]): OpenMrsObs[] {
  const leaves: OpenMrsObs[] = [];
  const walk = (list: OpenMrsObs[]): void => {
    for (const ob of list) {
      if (ob.voided) {
        continue;
      }
      if (ob.groupMembers?.length) {
        walk(ob.groupMembers);
        continue;
      }
      leaves.push(ob);
    }
  };
  walk(obs);
  return leaves;
}

/**
 * Observations, in two tiers:
 *
 *  - numeric observations of configured vitals concepts →
 *    `em-vital-signs-observation`: category fixed to `vital-signs`, LOINC code
 *    from `em-vital-signs-vs`, `effective[x]` sliced to dateTime, value
 *    restricted to Quantity;
 *  - everything else with a value → a base-R4B Observation (the IG constrains
 *    only the resources that declare its profiles; a plain Observation is
 *    conformant and preserves the clinical record).
 */
function buildObservationEntries(
  encounters: OpenMrsEncounter[],
  options: ShrVisitBundleOptions,
  ctx: EntryContext,
): void {
  let emitted = 0;
  let skippedWithoutValue = 0;
  let truncated = false;

  for (const encounter of encounters) {
    for (const obs of flattenObservations(encounter.obs ?? [])) {
      if (emitted >= options.maxObservationsPerBundle) {
        truncated = true;
        break;
      }
      const value = observationValue(obs, options);
      if (!value) {
        skippedWithoutValue += 1;
        continue;
      }
      const conceptUuid = obs.concept?.uuid;
      const vitalMapping = conceptUuid
        ? options.vitalSignsConceptMap[conceptUuid]
        : undefined;
      // The vitals profile allows value[x] = Quantity only — route just the
      // numeric readings there, everything else to the base profile.
      const asVital = vitalMapping && value.kind === 'quantity';

      const identifier = derivedIdentifier(options, `obs-${obs.uuid}`);
      const fullUrl = `urn:uuid:${deterministicUuid(`${options.amrsSourceUri}/fhir/Observation/${obs.uuid}`)}`;
      const resource: Record<string, unknown> = {
        resourceType: 'Observation',
        identifier: [identifier],
        status: 'final',
        code: asVital
          ? {
              coding: [
                { system: EXTERNAL_SYSTEMS.loinc, code: vitalMapping.loinc },
              ],
              ...(obs.concept?.display ? { text: obs.concept.display } : {}),
            }
          : conceptCodings(obs.concept, options),
        subject: { reference: ctx.patientFullUrl },
        encounter: { reference: ctx.encounterFullUrl },
        // Both profiles slice effective[x] to effectiveDateTime (min = 1 on
        // the vitals profile); the encounter datetime is the fallback when an
        // obs lacks its own.
        effectiveDateTime:
          toFhirDateTime(obs.obsDatetime) ??
          toFhirDateTime(encounter.encounterDatetime),
        [value.field]: value.content,
      };
      if (asVital) {
        resource.meta = {
          profile: [ctx.sha(SHA_PROFILE_PATHS.vitalSignsObservation)],
        };
        // category is min = 1 with a fixed vital-signs pattern on the profile.
        resource.category = [
          {
            coding: [
              {
                system: EXTERNAL_SYSTEMS.hl7ObservationCategory,
                code: 'vital-signs',
              },
            ],
          },
        ];
      }

      ctx.push(fullUrl, resource);
      emitted += 1;
    }
    if (truncated) {
      break;
    }
  }

  if (skippedWithoutValue > 0) {
    ctx.warnings.push(
      `${skippedWithoutValue} observations had no value and were not included.`,
    );
  }
  if (truncated) {
    ctx.warnings.push(
      `Observation cap reached (${options.maxObservationsPerBundle}) — later observations were not included.`,
    );
  }
}

/** The obs value as a FHIR element, or null when the obs carries nothing. */
function observationValue(
  obs: OpenMrsObs,
  options: ShrVisitBundleOptions,
): {
  kind: 'quantity' | 'code' | 'string' | 'datetime' | 'boolean';
  field: string;
  content: unknown;
} | null {
  if (obs.valueNumeric != null) {
    const conceptUuid = obs.concept?.uuid;
    const unit = conceptUuid
      ? options.vitalSignsConceptMap[conceptUuid]
      : undefined;
    return {
      kind: 'quantity',
      field: 'valueQuantity',
      content: {
        value: obs.valueNumeric,
        ...(unit?.unit ? { unit: unit.unit } : {}),
        system: EXTERNAL_SYSTEMS.ucum,
        ...(unit?.unitCode ? { code: unit.unitCode } : {}),
      },
    };
  }
  if (obs.valueCoded?.uuid) {
    return {
      kind: 'code',
      field: 'valueCodeableConcept',
      content: conceptCodings(obs.valueCoded, options),
    };
  }
  const datetime = toFhirDateTime(obs.valueDatetime ?? obs.valueDate);
  if (datetime) {
    return { kind: 'datetime', field: 'valueDateTime', content: datetime };
  }
  if (typeof obs.valueBoolean === 'boolean') {
    return {
      kind: 'boolean',
      field: 'valueBoolean',
      content: obs.valueBoolean,
    };
  }
  const text =
    obs.valueText ?? (typeof obs.value === 'string' ? obs.value : undefined);
  if (text) {
    return { kind: 'string', field: 'valueString', content: text };
  }
  if (typeof obs.value === 'number' && Number.isFinite(obs.value)) {
    return {
      kind: 'quantity',
      field: 'valueQuantity',
      content: { value: obs.value },
    };
  }
  if (typeof obs.value === 'boolean') {
    return {
      kind: 'boolean',
      field: 'valueBoolean',
      content: obs.value,
    };
  }
  return null;
}

/** A reference whose display is carried for readers (and SHR rendering). */
function referenceFromFullUrl(
  fullUrl: string,
  display?: string,
): FhirReference {
  return { reference: fullUrl, ...(display ? { display } : {}) };
}
