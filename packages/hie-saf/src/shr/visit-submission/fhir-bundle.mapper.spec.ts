/**
 * Mapper tests — the IG-compliance contract of buildShrVisitBundle, expressed
 * against the profile constraints verified on the live SHA server (see
 * sha-ig.constants.ts): profile declarations, fixed values, identifier
 * slices, required extensions, reference wiring and idempotency mechanics.
 */

import {
  buildShrVisitBundle,
  deterministicUuid,
  toFhirDateTime,
} from './fhir-bundle.mapper';
import { MissingPreconditionError, type FhirBundleEntry } from './types';
import {
  closedVisitContextFixture,
  encounterFixture,
  mapperOptionsFixture,
  PATIENT_UUID,
  patientFixture,
  PROVIDER_UUID,
  VISIT_TYPE_UUID,
  VISIT_UUID,
  visitFixture,
} from './shr-visit-submission.fixture';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA_BASE = 'https://sha.test/fhir';

/** Find entries by resourceType, in bundle order. */
function entriesOf(
  bundle: { entry?: FhirBundleEntry[] },
  resourceType: string,
): FhirBundleEntry[] {
  return (bundle.entry ?? []).filter(
    (entry) => entry.resource.resourceType === resourceType,
  );
}

/**
 * Find the entry whose `meta.profile` declares the given profile path.
 * `meta.profile` is a string ARRAY — `profile.includes('/em-poc-encounter')`
 * would be an exact-element match against the array, not a substring check.
 */
function withProfile(
  entries: FhirBundleEntry[],
  profilePath: string,
): FhirBundleEntry | undefined {
  return entries.find((entry) =>
    (entry.resource.meta?.profile ?? []).some((profile) =>
      profile.endsWith(profilePath),
    ),
  );
}

/** Whether a resource's `meta.profile` declares the given profile path. */
function declaresProfile(
  resource: FhirBundleEntry['resource'],
  profilePath: string,
): boolean {
  return (resource.meta?.profile ?? []).some((profile) =>
    profile.endsWith(profilePath),
  );
}

describe('deterministicUuid', () => {
  it('mints valid, lowercase RFC-4122 v5 UUIDs (what $validate demands of fullUrl)', () => {
    const uuid = deterministicUuid('some-name');
    expect(uuid).toMatch(UUID_RE);
    // Version nibble 5, RFC variant — a plain hash would not satisfy these.
    expect(uuid[14]).toBe('5');
    expect(uuid[19]).toMatch(/[89ab]/);
  });

  it('is stable across calls and distinct across names', () => {
    expect(deterministicUuid('a')).toBe(deterministicUuid('a'));
    expect(deterministicUuid('a')).not.toBe(deterministicUuid('b'));
  });
});

describe('toFhirDateTime', () => {
  it('normalizes OpenMRS offset-without-colon datetimes (+0300 → +03:00)', () => {
    expect(toFhirDateTime('2026-09-01T09:00:00+0300')).toBe(
      '2026-09-01T09:00:00+03:00',
    );
  });

  it('keeps already-conformant datetimes and rejects garbage', () => {
    expect(toFhirDateTime('2026-09-01T09:00:00+03:00')).toBe(
      '2026-09-01T09:00:00+03:00',
    );
    expect(toFhirDateTime('not-a-date')).toBeUndefined();
    expect(toFhirDateTime(undefined)).toBeUndefined();
  });
});

describe('buildShrVisitBundle', () => {
  const options = mapperOptionsFixture();
  const build = buildShrVisitBundle(closedVisitContextFixture(), options);
  const bundle = build.bundle;

  it('produces a collection bundle with urn:uuid fullUrls and a deterministic id', () => {
    // The shape POST /shr/bundles demands: type "collection" (never
    // transaction), a Bundle.id, and entries of {fullUrl, resource} only.
    expect(bundle.type).toBe('collection');
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.id).toMatch(UUID_RE);
    expect((bundle.entry ?? []).length).toBeGreaterThanOrEqual(8);
    for (const entry of bundle.entry ?? []) {
      expect(entry.fullUrl.startsWith('urn:uuid:')).toBe(true);
      expect(entry.fullUrl.replace('urn:uuid:', '')).toMatch(UUID_RE);
      expect(entry.request).toBeUndefined();
    }
  });

  it('is idempotent: rebuilding the same visit yields a byte-identical bundle', () => {
    const rebuilt = buildShrVisitBundle(closedVisitContextFixture(), options);
    expect(JSON.stringify(rebuilt.bundle)).toBe(JSON.stringify(bundle));
    // The id is scoped to the visit AND its closure instant — a corrected
    // stopDatetime (a re-closed visit) must yield a different id.
    const reclosed = buildShrVisitBundle(
      {
        ...closedVisitContextFixture(),
        visit: visitFixture({ stopDatetime: '2026-09-01T12:00:00+0300' }),
      },
      options,
    );
    expect(reclosed.bundle.id).not.toBe(bundle.id);
  });

  it('emits entries in dependency order (Patient → … → Conditions → Observations)', () => {
    const types = (bundle.entry ?? []).map(
      (entry) => entry.resource.resourceType,
    );
    expect(types.slice(0, 7)).toEqual([
      'Patient',
      'Organization',
      'Practitioner',
      'EpisodeOfCare',
      'Encounter', // incident
      'Encounter', // point of care
      'Condition',
    ]);
    expect(types.indexOf('Observation')).toBeGreaterThan(
      types.indexOf('Encounter'),
    );
  });

  it('mirrors the identity-verified extension on Patient and PoC Encounter (invariant em-poc-2)', () => {
    const [patient] = entriesOf(bundle, 'Patient');
    expect(patient.resource.extension?.[0]?.url).toBe(
      `${SHA_BASE}/StructureDefinition/em-patient-identity-verified`,
    );
    expect(patient.resource.extension?.[0]?.valueBoolean).toBe(true);

    const poc = withProfile(
      entriesOf(bundle, 'Encounter'),
      '/StructureDefinition/em-poc-encounter',
    );
    expect(poc).toBeDefined();
    expect(poc?.resource.extension?.[0]?.url).toBe(
      `${SHA_BASE}/StructureDefinition/em-patient-identity-verified`,
    );
    expect(poc?.resource.extension?.[0]?.valueBoolean).toBe(true);
  });

  it('carries the CR number and UPI as SHA identifier systems with their values', () => {
    const [patient] = entriesOf(bundle, 'Patient');
    const identifiers = patient.resource.identifier as Array<{
      system?: string;
      value?: string;
    }>;
    expect(identifiers).toContainEqual({
      use: 'official',
      system: 'http://hie.go.ke/fhir/identifier/cr-number',
      value: 'CR-123456',
    });
    expect(identifiers).toContainEqual({
      use: 'official',
      system: 'http://hie.go.ke/fhir/identifier/upi',
      value: 'UPI-98765',
    });
  });

  it('satisfies the em-poc-encounter profile (class FLD, identifier slices, participant, wiring)', () => {
    const poc = withProfile(
      entriesOf(bundle, 'Encounter'),
      '/StructureDefinition/em-poc-encounter',
    );
    expect(poc).toBeDefined();
    const encounter = poc!.resource;

    // class is FIXED by the profile — anything else is a validation error.
    expect(encounter.class).toEqual({
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActEncounterCode',
      code: 'FLD',
      display: 'Emergency medical services field response',
    });

    const identifiers = encounter.identifier as Array<{
      system: string;
      value: string;
    }>;
    expect(
      identifiers.find(
        (id) => id.system === 'http://hie.go.ke/fhir/identifier/incident-id',
      ),
    ).toEqual({
      system: 'http://hie.go.ke/fhir/identifier/incident-id',
      value: VISIT_UUID,
    });
    expect(
      identifiers.find(
        (id) =>
          id.system === 'http://hie.go.ke/fhir/identifier/poc-encounter-id',
      ),
    ).toEqual({
      system: 'http://hie.go.ke/fhir/identifier/poc-encounter-id',
      value: VISIT_UUID,
    });
    expect(encounter.status).toBe('finished');

    // priority: the fixture's EMERGENCY queue-priority obs maps to acuity red.
    expect(encounter.priority).toEqual({
      coding: [
        {
          system: `${SHA_BASE}/CodeSystem/em-clinical-acuity`,
          code: 'red',
          display: 'Red - Immediate',
        },
      ],
    });

    // participant min = 1, role coding fixed to the em-participant-role EMT code.
    const participant = (
      encounter.participant as Array<Record<string, unknown>>
    )[0];
    expect(participant.type).toEqual([
      {
        coding: [
          {
            system: `${SHA_BASE}/CodeSystem/em-participant-role`,
            code: 'emt',
            display: 'EMT / attending clinician',
          },
        ],
      },
    ]);

    // partOf (min = 1) → the incident encounter; episodeOfCare (min = 1) → EpisodeOfCare.
    const incident = withProfile(
      entriesOf(bundle, 'Encounter'),
      '/StructureDefinition/em-incident-encounter',
    );
    const episode = entriesOf(bundle, 'EpisodeOfCare')[0];
    expect((encounter.partOf as { reference?: string }).reference).toBe(
      incident?.fullUrl,
    );
    expect(
      (encounter.episodeOfCare as Array<{ reference?: string }>)[0].reference,
    ).toBe(episode?.fullUrl);
    expect((encounter.subject as { reference?: string }).reference).toBe(
      entriesOf(bundle, 'Patient')[0].fullUrl,
    );
    expect(encounter.serviceProvider).toBeTruthy();

    // Period normalized for em-poc-1 (end not before start).
    expect(encounter.period).toEqual({
      start: '2026-09-01T09:00:00+03:00',
      end: '2026-09-01T11:30:00+03:00',
    });
  });

  it('references each diagnosis from the PoC encounter (Encounter.diagnosis)', () => {
    const poc = withProfile(
      entriesOf(bundle, 'Encounter'),
      '/StructureDefinition/em-poc-encounter',
    );
    const diagnoses = poc?.resource.diagnosis as Array<{
      condition: { reference: string };
      rank?: number;
    }>;
    expect(diagnoses.length).toBe(2);
    const conditionFullUrls = new Set(
      entriesOf(bundle, 'Condition').map((entry) => entry.fullUrl),
    );
    for (const diagnosis of diagnoses) {
      expect(conditionFullUrls.has(diagnosis.condition.reference)).toBe(true);
    }
    expect(diagnoses[0].rank).toBe(1);
  });

  it('satisfies the em-incident-encounter profile (caller ext, identifiers, priority, NO partOf)', () => {
    const incident = withProfile(
      entriesOf(bundle, 'Encounter'),
      '/StructureDefinition/em-incident-encounter',
    );
    expect(incident).toBeDefined();
    const encounter = incident!.resource;

    const caller = encounter.extension?.[0];
    expect(caller?.url).toBe(
      `${SHA_BASE}/StructureDefinition/em-incident-caller`,
    );
    const children = caller?.extension ?? [];
    expect(
      children.find((child) => child.url === 'isPatient')?.valueBoolean,
    ).toBe(true);
    expect(
      (children.find((child) => child.url === 'relationship')
        ?.valueCodeableConcept?.coding ?? [])[0]?.system,
    ).toBe(`${SHA_BASE}/CodeSystem/em-caller-relationship`);
    expect(
      children.find((child) => child.url === 'individual')?.valueReference
        ?.reference,
    ).toBe(entriesOf(bundle, 'Patient')[0].fullUrl);

    const identifiers = encounter.identifier as Array<{
      system: string;
      value: string;
    }>;
    expect(
      identifiers.find(
        (id) => id.system === 'http://hie.go.ke/fhir/identifier/incident-id',
      ),
    ).toEqual({
      system: 'http://hie.go.ke/fhir/identifier/incident-id',
      value: VISIT_UUID,
    });
    expect(
      identifiers.find(
        (id) => id.system === 'http://hie.go.ke/fhir/identifier/dispatch-id',
      ),
    ).toEqual({
      system: 'http://hie.go.ke/fhir/identifier/dispatch-id',
      value: `${VISIT_UUID}-dispatch`,
    });
    expect(encounter.type).toEqual([
      {
        coding: [
          {
            system: `${SHA_BASE}/CodeSystem/em-incident-type`,
            code: 'medical',
            display: 'Medical emergency',
          },
        ],
      },
    ]);
    // Fixture acuity red → dispatch priority P1.
    expect(encounter.priority).toEqual({
      coding: [
        {
          system: `${SHA_BASE}/CodeSystem/em-dispatch-priority`,
          code: 'P1',
          display: 'Priority 1 – Immediate',
        },
      ],
    });
    // class is min = 1 on base R4 and NOT relaxed by em-incident-encounter —
    // the incident shares the family's fixed FLD class (live $validate flagged
    // its absence twice before this was added).
    expect(encounter.class).toEqual({
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActEncounterCode',
      code: 'FLD',
      display: 'Emergency medical services field response',
    });
    // partOf is 0..0 on this profile — the key must not exist at all.
    expect('partOf' in encounter).toBe(false);
    expect(encounter.serviceProvider).toBeTruthy();
  });

  it('keys the incident encounter apart from the visit (bdl-7: unique fullUrls)', () => {
    // The default fixture has no incident-id attribute, so incidentId falls
    // back to the visit uuid — the two Encounters would otherwise derive the
    // SAME fullUrl and HAPI $validate rejects the bundle (bdl-7 + a "multiple
    // matches" error on every reference to it). The mapper must re-key the
    // incident's fullUrl while the identifier VALUE stays the visit uuid.
    const incident = withProfile(
      entriesOf(bundle, 'Encounter'),
      '/StructureDefinition/em-incident-encounter',
    );
    const poc = withProfile(
      entriesOf(bundle, 'Encounter'),
      '/StructureDefinition/em-poc-encounter',
    );
    expect(incident!.fullUrl).not.toBe(poc!.fullUrl);
    expect(
      (
        incident!.resource.identifier as Array<{
          system: string;
          value: string;
        }>
      ).find(
        (id) => id.system === 'http://hie.go.ke/fhir/identifier/incident-id',
      )?.value,
    ).toBe(VISIT_UUID);
    expect(
      build.warnings.some((warning) =>
        warning.includes('keyed distinctly from the visit'),
      ),
    ).toBe(true);

    // …and across the WHOLE bundle, no two entries may share a fullUrl.
    const fullUrls = (bundle.entry ?? []).map((entry) => entry.fullUrl);
    expect(new Set(fullUrls).size).toBe(fullUrls.length);
  });

  it('satisfies em-incident-2: EpisodeOfCare carries the same incident identifier', () => {
    const [episode] = entriesOf(bundle, 'EpisodeOfCare');
    expect(episode.resource.status).toBe('finished');
    expect(episode.resource.identifier).toEqual([
      {
        system: 'http://hie.go.ke/fhir/identifier/incident-id',
        value: VISIT_UUID,
      },
    ]);
    expect((episode.resource.patient as { reference?: string }).reference).toBe(
      entriesOf(bundle, 'Patient')[0].fullUrl,
    );
  });

  it('emits Organization with the facility code and Practitioner with the provider identity', () => {
    const [organization] = entriesOf(bundle, 'Organization');
    expect(organization.resource.identifier).toEqual([
      {
        system: 'http://hie.go.ke/fhir/identifier/facility-code',
        value: 'FID-27-114387-5',
        type: { text: 'fr-code' },
      },
    ]);
    const [practitioner] = entriesOf(bundle, 'Practitioner');
    expect((practitioner.resource.identifier ?? [])[0]?.value).toBe(
      PROVIDER_UUID,
    );
  });

  it('maps diagnoses to ke-condition with certainty-driven verificationStatus and standard codings', () => {
    const conditions = entriesOf(bundle, 'Condition');
    expect(conditions.length).toBe(2);
    for (const condition of conditions) {
      expect(
        declaresProfile(
          condition.resource,
          '/StructureDefinition/ke-condition',
        ),
      ).toBe(true);
      expect(condition.resource.subject).toBeTruthy();
      expect(condition.resource.clinicalStatus).toBeTruthy();
      expect(condition.resource.verificationStatus).toBeTruthy();
      expect(condition.resource.onsetDateTime).toBeTruthy();
      expect(condition.resource.recordedDate).toBeTruthy();
      expect(condition.resource.encounter).toBeTruthy();
    }

    const coded = conditions.find((entry) =>
      (
        entry.resource.code as { coding?: Array<{ code?: string }> }
      ).coding?.some((c) => c.code === 'B54'),
    );
    expect(coded).toBeDefined();
    expect(
      ((
        coded!.resource.verificationStatus as {
          coding?: Array<{ code?: string }>;
        }
      ).coding ?? [])[0]?.code,
    ).toBe('confirmed');

    // The non-coded diagnosis: a `code` carrying only text, no coding.
    const textual = conditions.find(
      (entry) => !(entry.resource.code as { coding?: unknown[] }).coding,
    );
    expect((textual!.resource.code as { text?: string }).text).toBe(
      'Suspected typhoid',
    );
    expect(
      ((
        textual!.resource.verificationStatus as {
          coding?: Array<{ code?: string }>;
        }
      ).coding ?? [])[0]?.code,
    ).toBe('provisional');
  });

  it('emits vitals under em-vital-signs-observation with LOINC + UCUM, and the rest as base Observations', () => {
    const observations = entriesOf(bundle, 'Observation');

    const sbp = observations.find(
      (entry) =>
        (entry.resource.code as { coding?: Array<{ code?: string }> })
          .coding?.[0]?.code === '8480-6',
    );
    expect(sbp).toBeDefined();
    expect(
      declaresProfile(
        sbp!.resource,
        '/StructureDefinition/em-vital-signs-observation',
      ),
    ).toBe(true);
    expect(sbp!.resource.valueQuantity).toEqual({
      value: 120,
      unit: 'mmHg',
      system: 'http://unitsofmeasure.org',
      code: 'mm[Hg]',
    });
    expect(sbp!.resource.category).toEqual([
      {
        coding: [
          {
            system:
              'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'vital-signs',
          },
        ],
      },
    ]);
    expect(sbp!.resource.effectiveDateTime).toBe('2026-09-01T09:20:00+03:00');

    // Group members are flattened: DBP present, the voided member is not.
    const dbp = observations.find(
      (entry) =>
        (entry.resource.code as { coding?: Array<{ code?: string }> })
          .coding?.[0]?.code === '8462-4',
    );
    expect(dbp).toBeDefined();
    const voidedFullUrl = `urn:uuid:${deterministicUuid(
      'https://amrs.ampath.or.ke/fhir/Observation/obs-voided-member-1',
    )}`;
    expect(observations.some((entry) => entry.fullUrl === voidedFullUrl)).toBe(
      false,
    );

    // The queue-priority obs is not a configured vital — base profile, no meta.
    const priority = observations.find((entry) => {
      const coding = (
        entry.resource.code as {
          coding?: Array<{ system?: string; code?: string }>;
        }
      ).coding?.[0];
      return (
        coding?.system === 'https://amrs.ampath.or.ke/fhir/concept' &&
        coding?.code === '8e86ff12-ec83-41e8-a534-bb410739d880'
      );
    });
    expect(priority).toBeDefined();
    expect(priority!.resource.meta).toBeFalsy();
    expect(priority!.resource.valueCodeableConcept).toEqual({
      coding: [
        {
          system: 'https://amrs.ampath.or.ke/fhir/concept',
          code: 'concept-emergency',
          display: 'EMERGENCY',
        },
      ],
      text: 'EMERGENCY',
    });

    // The no-value obs from the fixture was skipped with a warning.
    expect(
      build.warnings.some((warning) =>
        warning.includes('observations had no value'),
      ),
    ).toBe(true);
  });

  it('uses the visit-attribute incident id when the attribute type is configured', () => {
    const optionsWithAttribute = mapperOptionsFixture({
      incidentIdAttributeTypeUuid: 'attr-incident-1',
      dispatchIdAttributeTypeUuid: 'attr-dispatch-1',
    });
    const context = closedVisitContextFixture();
    context.visit = visitFixture({
      attributes: [
        {
          uuid: 'attr-1',
          value: 'INC-2026-000042',
          attributeType: { uuid: 'attr-incident-1', display: 'Incident id' },
        },
        {
          uuid: 'attr-2',
          value: 'DSP-77',
          attributeType: { uuid: 'attr-dispatch-1', display: 'Dispatch id' },
        },
      ],
    });
    const built = buildShrVisitBundle(context, optionsWithAttribute);
    expect(built.incidentId).toBe('INC-2026-000042');
    const episode = entriesOf(built.bundle, 'EpisodeOfCare')[0];
    expect(episode.resource.identifier).toEqual([
      {
        system: 'http://hie.go.ke/fhir/identifier/incident-id',
        value: 'INC-2026-000042',
      },
    ]);
    const incident = withProfile(
      entriesOf(built.bundle, 'Encounter'),
      '/StructureDefinition/em-incident-encounter',
    );
    expect(
      (
        incident!.resource.identifier as Array<{
          system: string;
          value: string;
        }>
      ).find(
        (id) => id.system === 'http://hie.go.ke/fhir/identifier/dispatch-id',
      ),
    ).toEqual({
      system: 'http://hie.go.ke/fhir/identifier/dispatch-id',
      value: 'DSP-77',
    });
    // A REAL incident id differs from the visit uuid, so no fallback warning.
    expect(
      built.warnings.some((warning) =>
        warning.includes('keyed distinctly from the visit'),
      ),
    ).toBe(false);
  });

  it('defaults acuity to "unknown" (with a warning) when no triage obs exists', () => {
    const context = closedVisitContextFixture();
    const noPriority = encounterFixture({ obs: [] });
    context.encounters = [noPriority];
    const built = buildShrVisitBundle(context, options);
    const poc = withProfile(
      entriesOf(built.bundle, 'Encounter'),
      '/StructureDefinition/em-poc-encounter',
    );
    expect(
      (poc!.resource.priority as { coding: Array<{ code: string }> }).coding[0]
        .code,
    ).toBe('unknown');
    expect(
      built.warnings.some((warning) =>
        warning.includes('defaulted to "unknown"'),
      ),
    ).toBe(true);
  });

  it('marks identity as unverified when the patient has no CR number or UPI', () => {
    const context = closedVisitContextFixture();
    context.patient = patientFixture({ identifiers: [] });
    const built = buildShrVisitBundle(context, options);
    expect(built.identityVerified).toBe(false);
    const [patient] = entriesOf(built.bundle, 'Patient');
    expect(patient.resource.extension).toBeFalsy();
    expect(built.warnings.some((warning) => warning.includes('identity'))).toBe(
      true,
    );
  });

  it('throws MissingPreconditionError when the visit has no encounter provider', () => {
    const context = closedVisitContextFixture();
    context.encounters = [encounterFixture({ encounterProviders: [] })];
    expect(() => buildShrVisitBundle(context, options)).toThrow(
      MissingPreconditionError,
    );
  });

  it('clamps a period whose end precedes its start (em-poc-1 must hold)', () => {
    const context = closedVisitContextFixture();
    context.visit = visitFixture({ stopDatetime: '2026-09-01T08:00:00+0300' });
    const built = buildShrVisitBundle(context, options);
    const poc = withProfile(
      entriesOf(built.bundle, 'Encounter'),
      '/StructureDefinition/em-poc-encounter',
    );
    expect(poc!.resource.period).toEqual({
      start: '2026-09-01T09:00:00+03:00',
      end: '2026-09-01T09:00:00+03:00',
    });
    expect(built.warnings.some((warning) => warning.includes('clamped'))).toBe(
      true,
    );
  });

  it('respects the observation cap with a warning', () => {
    const capped = mapperOptionsFixture({ maxObservationsPerBundle: 1 });
    const built = buildShrVisitBundle(closedVisitContextFixture(), capped);
    expect(entriesOf(built.bundle, 'Observation').length).toBe(1);
    expect(
      built.warnings.some((warning) =>
        warning.includes('Observation cap reached'),
      ),
    ).toBe(true);
  });

  it('keeps stats consistent with the emitted entries', () => {
    const totalEntries = (build.bundle.entry ?? []).length;
    const counted = Object.values(build.stats).reduce(
      (sum, count) => sum + count,
      0,
    );
    expect(counted).toBe(totalEntries);
    expect(build.stats.Observation).toBeGreaterThanOrEqual(2);
    expect(build.stats.Encounter).toBe(2);
    expect(build.stats.Condition).toBe(2);
  });

  it('does not leak the OpenMRS patient uuid into the bundle', () => {
    // Linkage to the SHR is by CR/UPI identifiers and urn:uuid references —
    // the AMRS internal patient uuid never appears as an id or identifier value.
    expect(JSON.stringify(bundle)).not.toContain(PATIENT_UUID);
  });
});

describe('buildShrVisitBundle — clinical family', () => {
  const options = mapperOptionsFixture({ family: 'clinical' });
  const build = buildShrVisitBundle(closedVisitContextFixture(), options);
  const bundle = build.bundle;
  const [encounterEntry] = entriesOf(bundle, 'Encounter');
  const encounter = encounterEntry.resource;

  it('emits ONE base-R4 Encounter and no emergency scaffolding', () => {
    expect(entriesOf(bundle, 'Encounter').length).toBe(1);
    // No EpisodeOfCare, no incident encounter, and none of the emergency-IG
    // vocabulary on the visit encounter.
    expect(entriesOf(bundle, 'EpisodeOfCare')).toEqual([]);
    expect(encounter.meta).toBeFalsy();
    expect(encounter.extension).toBeFalsy();
    expect(encounter.priority).toBeFalsy();
    // partOf/episodeOfCare are structural on the emergency profiles — the
    // clinical encounter must not carry the keys at all.
    expect('partOf' in encounter).toBe(false);
    expect('episodeOfCare' in encounter).toBe(false);
    // Patient → Organization → Practitioner → Encounter → Conditions → Obs.
    const types = (bundle.entry ?? []).map((e) => e.resource.resourceType);
    expect(types.slice(0, 5)).toEqual([
      'Patient',
      'Organization',
      'Practitioner',
      'Encounter',
      'Condition',
    ]);
    expect(types.indexOf('Observation')).toBeGreaterThan(
      types.indexOf('Encounter'),
    );
    expect(build.family).toBe('clinical');
    expect(build.incidentId).toBeUndefined();
  });

  it('classes the Encounter from the visit type and carries the visit id under the AMRS-derived system', () => {
    // Unmapped visit type → the configured default (AMB, ambulatory).
    expect(encounter.class).toEqual({
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActEncounterCode',
      code: 'AMB',
      display: 'ambulatory',
    });
    // Not the emergency IG's poc-encounter-id — the visit's own id, derived.
    expect(encounter.identifier).toEqual([
      {
        system: 'https://amrs.ampath.or.ke/fhir/identifier/derived',
        value: `visit-${VISIT_UUID}`,
      },
    ]);
    expect(encounter.status).toBe('finished');
    // The AMRS visit type rides along as `Encounter.type`, losslessly.
    expect(encounter.type).toEqual([
      {
        coding: [
          {
            system: 'https://amrs.ampath.or.ke/fhir/concept',
            code: VISIT_TYPE_UUID,
            display: 'Facility Visit',
          },
        ],
        text: 'Facility Visit',
      },
    ]);
    // The participant carries no role coding — the EMT role is emergency-IG
    // vocabulary — but the provider identity is wired like in emergency.
    const participant = (
      encounter.participant as Array<Record<string, unknown>>
    )[0];
    expect(participant.type).toBeUndefined();
    expect((participant.individual as { reference?: string }).reference).toBe(
      entriesOf(bundle, 'Practitioner')[0].fullUrl,
    );
    expect((encounter.subject as { reference?: string }).reference).toBe(
      entriesOf(bundle, 'Patient')[0].fullUrl,
    );
    expect(
      (encounter.serviceProvider as { reference?: string }).reference,
    ).toBe(entriesOf(bundle, 'Organization')[0].fullUrl);
    expect(encounter.period).toEqual({
      start: '2026-09-01T09:00:00+03:00',
      end: '2026-09-01T11:30:00+03:00',
    });
  });

  it('maps the visit type to a configured v3-ActEncounterCode class', () => {
    const inpatient = mapperOptionsFixture({
      family: 'clinical',
      visitTypeClassMap: { [VISIT_TYPE_UUID]: 'IMP' },
    });
    const built = buildShrVisitBundle(closedVisitContextFixture(), inpatient);
    expect(entriesOf(built.bundle, 'Encounter')[0].resource.class).toEqual({
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActEncounterCode',
      code: 'IMP',
      display: 'inpatient encounter',
    });
  });

  it('keeps ke-condition, with diagnoses referenced from the Encounter', () => {
    const conditions = entriesOf(bundle, 'Condition');
    expect(conditions.length).toBe(2);
    for (const condition of conditions) {
      expect(
        declaresProfile(
          condition.resource,
          '/StructureDefinition/ke-condition',
        ),
      ).toBe(true);
      expect(
        (condition.resource.encounter as { reference?: string }).reference,
      ).toBe(encounterEntry.fullUrl);
    }
    const diagnoses = encounter.diagnosis as Array<{
      condition: { reference: string };
      rank?: number;
    }>;
    expect(diagnoses.length).toBe(2);
    expect(
      new Set(conditions.map((c) => c.fullUrl)).has(
        diagnoses[0].condition.reference,
      ),
    ).toBe(true);
    expect(diagnoses[0].rank).toBe(1);
  });

  it('still emits vitals under em-vital-signs-observation, pointed at the encounter', () => {
    const observations = entriesOf(bundle, 'Observation');
    const sbp = observations.find(
      (entry) =>
        (entry.resource.code as { coding?: Array<{ code?: string }> })
          .coding?.[0]?.code === '8480-6',
    );
    expect(sbp).toBeDefined();
    expect(
      declaresProfile(
        sbp!.resource,
        '/StructureDefinition/em-vital-signs-observation',
      ),
    ).toBe(true);
    expect((sbp!.resource.encounter as { reference?: string }).reference).toBe(
      encounterEntry.fullUrl,
    );
  });

  it('builds a providerless visit instead of throwing (no IG precondition in base R4)', () => {
    const context = closedVisitContextFixture();
    context.encounters = [encounterFixture({ encounterProviders: [] })];
    const built = buildShrVisitBundle(context, options);
    // The emergency family 422s here; clinical emits the care it has.
    expect(built.bundle.entry).toBeTruthy();
    const clinicalEncounter = entriesOf(built.bundle, 'Encounter')[0].resource;
    expect('participant' in clinicalEncounter).toBe(false);
    expect(entriesOf(built.bundle, 'Practitioner')).toEqual([]);
  });

  it('raises no acuity warning (priority is emergency-only vocabulary)', () => {
    expect(
      build.warnings.some((warning) =>
        warning.includes('defaulted to "unknown"'),
      ),
    ).toBe(false);
    // The valueless-obs warning is family-independent and stays.
    expect(
      build.warnings.some((warning) =>
        warning.includes('observations had no value'),
      ),
    ).toBe(true);
  });

  it('scopes the deterministic id to the family, but stays idempotent within it', () => {
    const emergencyId = buildShrVisitBundle(
      closedVisitContextFixture(),
      mapperOptionsFixture(),
    ).bundle.id;
    expect(bundle.id).toMatch(UUID_RE);
    expect(bundle.id).not.toBe(emergencyId);
    const rebuilt = buildShrVisitBundle(closedVisitContextFixture(), options);
    expect(JSON.stringify(rebuilt.bundle)).toBe(JSON.stringify(bundle));
  });

  it('asserts identity on the Patient but not the Encounter (em-poc-2 does not apply)', () => {
    const [patient] = entriesOf(bundle, 'Patient');
    expect(patient.resource.extension?.[0]?.url).toBe(
      `${SHA_BASE}/StructureDefinition/em-patient-identity-verified`,
    );
    expect(patient.resource.extension?.[0]?.valueBoolean).toBe(true);
    expect(encounter.extension).toBeFalsy();
    expect(build.identityVerified).toBe(true);
  });
});
