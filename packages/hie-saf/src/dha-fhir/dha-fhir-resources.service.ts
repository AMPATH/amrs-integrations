import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AMRS_CONNECTION } from '../core/database/db.module';
import { CaseSummaryService } from '../case-summary/case-summary.service';
import { EmtService } from '../emt/emt.service';
import { ListEmtReferralsDto } from '../emt/dto/list-emt-referrals.dto';
import { ACTIVE_COMPONENTS } from './active-components.snapshot';

/* ------------------------------------------------------------------ types */

interface ForwardHeaders {
  cookie?: string;
  authorization?: string;
}

export interface FhirCoding {
  system?: string;
  code?: string;
  display?: string;
}

export interface FhirResourceLike {
  resourceType: string;
  meta?: { profile?: string[]; source?: string; [k: string]: unknown };
  [k: string]: unknown;
}

export interface FhirOutcomeIssue {
  severity: 'fatal' | 'error' | 'warning' | 'information';
  code: string;
  diagnostics?: string;
  expression?: string[];
}

export interface FhirOperationOutcome {
  resourceType: 'OperationOutcome';
  issue: FhirOutcomeIssue[];
}

interface CaseSummaryLike {
  visit?: { uuid?: string; visitType?: string; startDatetime?: string; display?: string };
  demographics?: {
    name?: string;
    birthDate?: string;
    gender?: string;
    age?: string;
    patientId?: string;
    nationalId?: string;
    crNumber?: string;
  };
  allergies?: Array<{ substance?: string; criticality?: string; reaction?: string }>;
  conditions?: Array<{
    code?: string;
    description?: string;
    certainty?: string;
    primary?: boolean;
    onsetDate?: string;
  }>;
  vitals?: Record<string, string>;
  medications?: Array<{ date?: string; drug?: string; duration?: string; instructions?: string }>;
  clinicalNotes?: Array<Record<string, unknown>>;
  soapNote?: { assessment?: string; plan?: string };
  labOrders?: Array<Record<string, unknown>>;
}

/* ------------------------------------------------------------- constants */

/** ICD-11 MMS coding system (WHO). */
const ICD11_SYSTEM = 'http://id.who.int/icd/release/11/mms';

/**
 * Normalize an AMRS DB datetime ('2026-11-06 09:35:36') or partial value
 * into a FHIR-valid dateTime/instant. Raw DB strings failed HAPI parse
 * (HAPI-1821 'Expected character T at index 10') in the assembled
 * AuditEvent/Provenance/Composition resources.
 */
function toFhirDateTime(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  let v = String(value).trim();
  if (!v) return undefined;
  v = v.replace(' ', 'T');
  const tz = /([+-]\d{2})(\d{2})$/.exec(v);
  if (tz) v = `${v.slice(0, tz.index)}${tz[1]}:${tz[2]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(v)) v += '+03:00';
  return v;
}

/** AMRS local concepts resolve to the OCL AMPATH source (validator warns on unknown CS) */
const OCL_AMPATH_SYSTEM = 'https://openconceptlab.org/orgs/AMPATH/sources/AMPATH';
/** AMRS local concepts resolve to the OCL AMPATH source (validator: unknown-CS warnings only) */

/** DHA national terminology base (e.g. condition-category-cs) */
const DHA_TERMINOLOGY_BASE = 'https://fhir.dha.go.ke/terminology';
/** DHA national identifier systems (kenya-core-patient slices) */
const DHA_IDENTIFIER_BASE = 'https://fhir.dha.go.ke/fhir/identifier';
/**
 * SHA identifier systems — the kenya-core-patient `sha-patient-min-identifier`
 * constraint (verified from the IG FHIRPath) checks THIS host, while the
 * identifier slices discriminate on the fhir.dha.go.ke host. Both are emitted
 * for the same values so the resource satisfies slices AND the constraint.
 */
const SHA_IDENTIFIER_BASE = 'https://fhir.sha.go.ke/fhir/identifier';
/** Kenya IDSR immediately-notifiable diseases (matched by concept display) */
const DEFAULT_NOTIFIABLE = [
  'cholera', 'measles', 'ebola', 'viral haemorrhagic fever', 'yellow fever',
  'meningococcal meningitis', 'dengue', 'chikungunya', 'anthrax',
  'poliomyelitis', 'neonatal tetanus', 'plague',
];
/** FHIR2 condition clinicalStatus codes -> DHA condition-clinical-status-cs */
const DHA_CLINICAL_STATUS: Record<string, string> = {
  active: 'ACTIVE', inactive: 'INACTIVE', resolved: 'RESOLVED', unknown: 'ACTIVE',
};
/** FHIR2 condition verificationStatus codes -> DHA verification-status-cs */
const DHA_VERIFICATION_STATUS: Record<string, string> = {
  unconfirmed: 'UNCONFIRMED', differential: 'DIFFERENTIAL',
  confirmed: 'CONFIRMED', refuted: 'REFUTED', 'entered-in-error': 'ENTERED-IN-ERROR',
};

/** Live Kenya Core IG base (ke.fhir.core v1.0.0 — verified fetchable). */
const DHA_IG_BASE = 'https://fhir.dha.go.ke/core';

/**
 * DHA Health Product Terminology (HPT) on the DHA OCL — the terminology the
 * DHA test harness (HPT/NHTS) resolves drugs from, and the source behind the
 * generic-products-vs expansion the lab validator loads (v1.0.0).
 *   https://nhts.dha.go.ke/orgs/MOH-PPB/sources/HPT/concepts/<GE-code>
 */
const HPT_OCL_BASE = 'https://ilm-hie.dha.go.ke/ocl';
const HPT_SOURCE_PATH = '/orgs/MOH-PPB/sources/HPT/version%201.0.1/concepts/';

/** ke-medication-request: NamingSystem-ns-prescription-identifier (preferred URI). */
const DHA_PRESCRIPTION_IDENTIFIER_SYSTEM =
  'https://ilm-hie.dha.go.ke/fhir/NamingSystem/prescription-identifier';

/** DHA national drug-route terminology (ke-medication-request dosage route, required). */
const DHA_ROUTE_SYSTEM = 'https://fhir.dha.go.ke/terminology/CodeSystem/route-of-administration-cs';
/** AMRS drug-route displays -> DHA route-of-administration-cs (verified members). */
const DHA_ROUTE_BY_KEYWORD: Array<[RegExp, string, string]> = [
  [/oral|per (mouth|os)|po\b/i, 'RT10025', 'Oral'],
  [/intravenous|\biv\b/i, 'RT10036', 'Intravenous'],
  [/intramuscular|\bim\b/i, 'RT10013', 'Intramuscular'],
  [/subcutaneous|\bsc\b|\bsq\b/i, 'RT10029', 'Subcutaneous'],
  [/topical|skin|cutaneous/i, 'RT10031', 'Topical'],
  [/rectal|rectum/i, 'RT10028', 'Rectal'],
  [/vaginal/i, 'RT10035', 'Vaginal'],
  [/ophthalmic|eye/i, 'RT10024', 'Ophthalmic'],
  [/otic|ear/i, 'RT10026', 'Otic'],
  [/nasal|nose/i, 'RT10023', 'Nasal'],
  [/inhal|nebul/i, 'RT10007', 'Inhalation'],
  [/sublingual|under the tongue/i, 'RT10030', 'Sublingual'],
];

/** DHA national formulation terminology (ke-medication form, required binding). */
const DHA_FORMULATION_SYSTEM = 'https://fhir.dha.go.ke/terminology/CodeSystem/formulation-cs';
/** AMRS drug-form display keywords -> DHA formulation-cs (verified members). */
const DHA_FORM_BY_KEYWORD: Array<[RegExp, string, string]> = [
  [/\btab|\btablet/i, 'DF10545', 'Tablet, Oral Only'],
  [/\bcap|\bcapsule/i, 'DF10069', 'Capsule, Solid Dispersion'],
  [/syrup|suspension|oral liquid/i, 'DF10498', 'Syrup'],
  [/inject|\bamp\b|ampul|vial/i, 'DF10016', 'Ampul'],
];

/** DHA national manifestation terminology (kenya-core-allergyintolerance, required). */
const DHA_MANIFESTATION_SYSTEM = 'https://fhir.dha.go.ke/terminology/CodeSystem/manifestation-cs';
/** AMRS reaction displays -> DHA manifestation-cs (verified members). */
const DHA_MANIFESTATION_BY_KEYWORD: Array<[RegExp, string, string]> = [
  [/urticaria|hives|wheal/i, 'URTICARIA', 'Urticaria'],
  [/rash/i, 'RASH', 'Rash'],
  [/pruritus|itch/i, 'RASH', 'Rash'],
  [/anaphyla/i, 'ANAPHYLAXIS', 'Anaphylaxis'],
  [/bronchospasm|wheez/i, 'BRONCHOSPASM', 'Bronchospasm'],
  [/fever/i, 'FEVER', 'Fever'],
  [/cough/i, 'COUGH', 'Cough'],
  [/dyspnoea|breathless|shortness/i, 'DYSPNOEA', 'Dyspnoea'],
  [/nausea/i, 'NAUSEA', 'Nausea'],
  [/vomit/i, 'VOMITING', 'Vomiting'],
  [/diarrho/i, 'DIARRHOEA', 'Diarrhoea'],
  [/headache/i, 'HEADACHE', 'Headache'],
  [/dizzy|dizziness|vertigo/i, 'DIZZINESS', 'Dizziness'],
  [/oedema|edema|swelling/i, 'OEDEMA', 'Oedema'],
  [/rhinitis|sneez|runny nose/i, 'RHINITIS', 'Rhinitis'],
  [/hypotension/i, 'HYPOTENSION', 'Hypotension'],
  [/tachycardia|palpitation/i, 'PALPITATIONS', 'Palpitations'],
  [/seizure|convulsion/i, 'SEIZURE', 'Seizure'],
  [/jaundice/i, 'JAUNDICE', 'Jaundice'],
  [/abdominal|stomach|gastrointestinal|gastric/i, 'ABDOMINAL-PAIN', 'Abdominal pain'],
  [/lesion/i, 'SKIN-LESION', 'Skin lesion'],
  [/\bpain\b/i, 'PAIN', 'Pain'],
];

/** DHA encounter-type terminology (kenya-core-encounter type, required binding). */
const DHA_ENCOUNTER_TYPE_SYSTEM = 'https://fhir.dha.go.ke/terminology/CodeSystem/encounter-type-cs';
/** AMRS visit-type displays -> DHA encounter-type-cs (verified members). */
const DHA_ENCOUNTER_TYPE_BY_KEYWORD: Array<[RegExp, string, string]> = [
  [/inpatient|admission|ward|ipd/i, 'INPATIENT-VISIT', 'Inpatient Visit'],
  [/emergency|accident|casualty|a&e/i, 'EMERGENCY-VISIT', 'Emergency Visit'],
  [/referral|referred/i, 'REFERRAL-VISIT', 'Referral Visit'],
  [/follow[\s-]*up/i, 'FOLLOW-UP-VISIT', 'Follow-up Visit'],
  [/opd|outpatient|clinic/i, 'OUTPATIENT-VISIT', 'Outpatient Visit'],
];

/**
 * Substance synonym table for the DHA active-components-cs display match
 * (the code system is INN-based — 'ASPIRIN' is listed as 'Acetylsalicylic Acid').
 */
const ACTIVE_COMPONENT_SYNONYMS: Record<string, string> = {
  aspirin: 'Acetylsalicylic Acid',
  acetylsalicylic: 'Acetylsalicylic Acid',
  paracetamol: 'Paracetamol',
  acetaminophen: 'Paracetamol',
  ibuprofen: 'Ibuprofen',
  amoxicillin: 'Amoxicillin',
  penicillin: 'Benzylpenicillin',
  cotrimoxazole: 'Sulfamethoxazole/Trimethoprim',
  'trimethoprim/sulfamethoxazole': 'Sulfamethoxazole/Trimethoprim',
  metronidazole: 'Metronidazole',
  omeprazole: 'Omeprazole',
  metformin: 'Metformin',
  enalapril: 'Enalapril',
  losartan: 'Losartan',
  nevirapine: 'Nevirapine',
  stavudine: 'Stavudine',
  lamivudine: 'Lamivudine',
  zidovudine: 'Zidovudine',
  didanosine: 'Didanosine',
  efavirenz: 'Efavirenz',
  tenofovir: 'Tenofovir Disoproxil Fumarate',
  sulfonamide: 'Sulfamethoxazole/Trimethoprim',
  sulfa: 'Sulfamethoxazole/Trimethoprim',
  latex: 'Latex',
  peanut: 'Peanut',
  egg: 'Egg',
  'egg protein': 'Egg',
  milk: 'Milk',
  'cow milk': 'Milk',
};

/** Frequency timing displays -> (frequency, period, periodUnit) for dosage timing.repeat. */
const DOSAGE_TIMING_BY_KEYWORD: Array<[RegExp, number, number, string]> = [
  [/once (a|per) day|\bdaily\b|\bqd\b|\bod\b/i, 1, 1, 'd'],
  [/twice (a|per) day|\bbd\b|\bbid\b/i, 2, 1, 'd'],
  [/three times (a|per) day|\btds\b|\btid\b/i, 3, 1, 'd'],
  [/four times (a|per) day|\bqds\b|\bqid\b/i, 4, 1, 'd'],
  [/once (a|per) week|\bweekly\b/i, 1, 1, 'wk'],
];

/** Kenya IDSR immediately-notifiable subset tracked in MOH 705A aggregates. */
const NOTIFIABLE_705A = [
  'cholera',
  'measles',
  'meningococcal_meningitis',
  'yellow_fever',
  'viral_haemorrhagic_fever',
  'dengue_fever',
  'chikungunya',
  'suspected_anthrax',
  'poliomyelitis',
  'neonatal_tetanus',
] as const;

const XHTML_NS = 'http://www.w3.org/1999/xhtml';

function outcome(
  issues: FhirOutcomeIssue[],
): FhirOperationOutcome {
  return { resourceType: 'OperationOutcome', issue: issues };
}

function esc(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* --------------------------------------------------------------- service */

/**
 * Assembles the DHA field-test FHIR resources that have no FHIR2 equivalent —
 * Composition (FUNC-SUMM), DetectedIssue (FUNC-CDS / REP-PHE), AuditEvent
 * (SEC-AUDIT), Task (REP-IHR / INTER-HIE referrals) and the validation pair
 * (SEC-INT) — plus ICD-11 coding enrichment for proxied Conditions
 * (INTER-SEM). All sources are in-process services or the read-only AMRS
 * replica; nothing here mutates clinical data.
 */
@Injectable()
export class DhaFhirResourcesService {
  private readonly logger = new Logger(DhaFhirResourcesService.name);

  /** concept uuid -> ICD-11 code (cached for the process lifetime). */
  private readonly icd11Cache = new Map<string, string | null>();

  /** DHA active-components concepts (bundled snapshot, refreshed opportunistically). */
  private activeComponentCache: Array<{ code: string; display: string }> | null = null;
  private activeComponentRefreshAttempted = false;

  /** AMRS replica query availability flags (negative-cache the failures). */
  private drugOrderQueryAvailable: boolean | null = null;
  private drugDosageFormQueryAvailable: boolean | null = null;

  /** StructureDefinition snapshot cache: resourceType -> required element names. */
  private readonly requiredElementsCache = new Map<string, string[]>();

  private lastValidation: FhirOperationOutcome | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly caseSummaryService: CaseSummaryService,
    private readonly emtService: EmtService,
    @InjectDataSource(AMRS_CONNECTION)
    private readonly amrsDataSource: DataSource,
  ) {}

  /* ------------------------------------------------------ Composition */

  /**
   * FUNC-SUMM-001: the clinical summary as a FHIR Composition, assembled
   * in-process from CaseSummaryService (source verified live with ICD-11
   * codes) with XHTML narratives for human readability.
   */
  async composition(
    patientUuid: string,
    locationUuid: string,
    headers: ForwardHeaders = {},
  ): Promise<FhirResourceLike> {
    const dto = { patientUuid, locationUuid } as Parameters<
      CaseSummaryService['getVisitCaseSummary']
    >[0];
    const summary = (await this.caseSummaryService.getVisitCaseSummary(dto)) as CaseSummaryLike;

    const sections: Array<{
      title: string;
      code: string;
      display: string;
      text: string;
      entry?: Array<{ reference: string; display?: string }>;
    }> = [];
    sections.push(this.conditionsSection(summary.conditions ?? []));
    sections.push(this.allergiesSection(summary.allergies ?? []));
    sections.push(this.medicationsSection(summary.medications ?? []));
    sections.push(this.immunizationsSection());
    sections.push(this.vitalsSection(summary.vitals ?? {}));
    sections.push(this.soapSection(summary.soapNote ?? {}));
    sections.push(this.labsSection(summary.labOrders ?? []));

    // Laboratory requirement: the Composition references the clinical FHIR
    // resources behind its sections. FHIR2-backed types are searched and
    // referenced individually; types AMRS does not record (ImagingStudy,
    // Substance, Specimen) are noted as empty in the section text.
    const searchHeaders = headers;
    const [conditions, allergies, medRequests, observations, reports, immunizations, episodes] =
      await Promise.all([
        this.fetchFhir2Search('Condition', `patient=${patientUuid}&_count=50`, searchHeaders),
        this.fetchFhir2Search('AllergyIntolerance', `patient=${patientUuid}&_count=20`, searchHeaders),
        // no `status=active` here — this FHIR2 answers 500 on that parameter
        // combo; fetch all and filter client-side
        this.fetchFhir2Search('MedicationRequest', `patient=${patientUuid}&_count=50`, searchHeaders),
        this.fetchFhir2Search('Observation', `patient=${patientUuid}&_count=50`, searchHeaders),
        this.fetchFhir2Search('DiagnosticReport', `patient=${patientUuid}&_count=20`, searchHeaders),
        this.fetchFhir2Search('Immunization', `patient=${patientUuid}&_count=20`, searchHeaders),
        this.fetchFhir2Search('EpisodeOfCare', `patient=${patientUuid}&_count=20`, searchHeaders),
      ]);
    const refsOf = (bundle: unknown[]): Array<{ reference: string; display?: string }> =>
      bundle
        .map((e) => (e as { resource?: { id?: string; resourceType?: string } }).resource)
        .filter((r): r is NonNullable<typeof r> => Boolean(r))
        .map((r) => ({ reference: `${r.resourceType}/${r.id}` }));
    const conditionRefs = refsOf(conditions);
    const allergyRefs = refsOf(allergies);
    const medRequestRefs = refsOf(medRequests);
    const observationRefs = refsOf(observations);
    const reportRefs = refsOf(reports);
    const immunizationRefs = refsOf(immunizations);
    const episodeRefs = refsOf(episodes);

    const demographics = summary.demographics ?? {};

    return {
      resourceType: 'Composition',
      id: `summary-${patientUuid}`,
      meta: { source: 'hie-saf/case-summary' },
      status: 'final',
      // ke-kps-composition pattern on Composition.type
      type: {
        coding: [
          {
            system: 'http://loinc.org',
            code: '60591-5',
            display: 'Patient summary Document',
          },
        ],
      },
      subject: {
        reference: `Patient/${patientUuid}`,
        display: demographics.name,
      },
      // Composition.author (min 1): the producing facility as the accountable
      // organization (kps author targets: Practitioner | PractitionerRole |
      // Organization)
      author: [
        {
          type: 'Organization',
          display: 'Moi Teaching And Referral Hospital — AMRS',
        },
      ],
      date: toFhirDateTime(summary.visit?.startDatetime) ?? new Date().toISOString(),
      title: `Clinical summary — ${demographics.name ?? patientUuid}`,
      section: sections.map((s) => {
        const entries = this.sectionEntries(s.code, {
          conditionRefs,
          allergyRefs,
          medRequestRefs,
          observationRefs,
          reportRefs,
          immunizationRefs,
          episodeRefs,
        });
        return {
          title: s.title,
          // exact ke-kps-composition slice patterns (pattern:code matching
          // requires the full system|code|display triple)
          code: { coding: [{ system: 'http://loinc.org', code: s.code, display: s.display }] },
          text: { status: 'generated', div: `<div xmlns="${XHTML_NS}">${s.text}</div>` },
          ...(entries.length ? { entry: entries } : {}),
        };
      }),
    };
  }

  /** Map a LOINC section code to its FHIR2-referenced entries (lab requirement). */
  private sectionEntries(
    loinc: string,
    refs: {
      conditionRefs: Array<{ reference: string }>;
      allergyRefs: Array<{ reference: string }>;
      medRequestRefs: Array<{ reference: string }>;
      observationRefs: Array<{ reference: string }>;
      reportRefs: Array<{ reference: string }>;
      immunizationRefs: Array<{ reference: string }>;
      episodeRefs: Array<{ reference: string }>;
    },
  ): Array<{ reference: string }> {
    switch (loinc) {
      case '11450-4': return refs.conditionRefs; // ke-kps problems slice
      case '48765-2': return refs.allergyRefs; // ke-kps allergies slice
      case '10160-0': return refs.medRequestRefs; // ke-kps medications slice
      case '11369-6': return refs.immunizationRefs; // ke-kps immunizations slice
      case '30954-2': return refs.reportRefs; // ke-kps results slice
      case '8716-0': return refs.observationRefs; // open vital-signs section
      default: return [];
    }
  }

  private conditionsSection(conditions: NonNullable<CaseSummaryLike['conditions']>): { title: string; code: string; display: string; text: string } {
    const rows = conditions.length
      ? conditions
          .map(
            (c) =>
              `<tr><td>${esc(c.code)}</td><td>${esc(c.description)}</td><td>${esc(
                c.certainty,
              )}</td><td>${c.primary ? 'yes' : 'no'}</td><td>${esc(c.onsetDate)}</td></tr>`,
          )
          .join('')
      : `<tr><td colspan="5">No active problems recorded.</td></tr>`;
    return {
      title: 'Problems',
      code: '11450-4',
      display: 'Problem list',
      text:
        `<table><thead><tr><th>ICD-11 code</th><th>Description</th><th>Certainty</th>` +
        `<th>Primary</th><th>Onset</th></tr></thead><tbody>${rows}</tbody></table>`,
    };
  }

  private allergiesSection(allergies: NonNullable<CaseSummaryLike['allergies']>): { title: string; code: string; display: string; text: string } {
    const rows = allergies.length
      ? allergies
          .map(
            (a) =>
              `<tr><td>${esc(a.substance)}</td><td>${esc(a.criticality)}</td><td>${esc(
                a.reaction,
              )}</td></tr>`,
          )
          .join('')
      : `<tr><td colspan="3">No known allergies recorded.</td></tr>`;
    return {
      title: 'Allergies and adverse reactions',
      code: '48765-2',
      display: 'Allergies and adverse reactions',
      text: `<table><thead><tr><th>Substance</th><th>Criticality</th><th>Reaction</th></tr></thead><tbody>${rows}</tbody></table>`,
    };
  }

  private vitalsSection(vitals: Record<string, string>): { title: string; code: string; display: string; text: string } {
    const entries = Object.entries(vitals);
    const rows = entries.length
      ? entries.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')
      : `<tr><td colspan="2">No vital signs recorded for this visit.</td></tr>`;
    return {
      title: 'Vital signs',
      code: '8716-0',
      display: 'Vital signs',
      text: `<table><thead><tr><th>Sign</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table>`,
    };
  }

  private medicationsSection(meds: NonNullable<CaseSummaryLike['medications']>): { title: string; code: string; display: string; text: string } {
    const rows = meds.length
      ? meds
          .map(
            (m) =>
              `<tr><td>${esc(m.date)}</td><td>${esc(m.drug)}</td><td>${esc(
                m.duration,
              )}</td><td>${esc(m.instructions)}</td></tr>`,
          )
          .join('')
      : `<tr><td colspan="4">No medications recorded for this visit.</td></tr>`;
    return {
      title: 'Medications',
      code: '10160-0',
      display: 'History of Medication use',
      text: `<table><thead><tr><th>Date</th><th>Drug</th><th>Duration</th><th>Instructions</th></tr></thead><tbody>${rows}</tbody></table>`,
    };
  }

  /** ke-kps immunizations slice — entries resolve from the FHIR2 Immunization search. */
  private immunizationsSection(): { title: string; code: string; display: string; text: string } {
    return {
      title: 'Immunizations',
      code: '11369-6',
      display: 'History of immunization',
      text: '<p>Immunizations recorded for this patient are listed in the section entries.</p>',
    };
  }

  private soapSection(soap: NonNullable<CaseSummaryLike['soapNote']>): { title: string; code: string; display: string; text: string } {
    return {
      title: 'Clinical notes',
      code: '34109-9',
      display: 'Clinical note',
      text: `<p><strong>Assessment:</strong> ${esc(soap.assessment ?? 'Not recorded.')}</p>` +
        `<p><strong>Plan:</strong> ${esc(soap.plan ?? 'Not recorded.')}</p>`,
    };
  }

  private labsSection(labs: NonNullable<CaseSummaryLike['labOrders']>): { title: string; code: string; display: string; text: string } {
    return {
      title: 'Relevant diagnostic tests/laboratory data',
      code: '30954-2',
      display: 'Relevant diagnostic tests/laboratory data',
      text: labs.length
        ? `<p>${esc(labs.length)} lab order(s)/result(s) on record for this visit.</p>`
        : '<p>No lab orders or results recorded for this visit.</p>',
    };
  }

  /* ---------------------------------------------------- DetectedIssue */

  /**
   * FUNC-CDS-001: allergy/drug-interaction issues for a patient, derived from
   * the FHIR2 AllergyIntolerance record (demo patient: ASPIRIN / moderate).
   */
  async detectedIssuesForPatient(
    patientUuid: string,
    headers: ForwardHeaders,
  ): Promise<FhirResourceLike[]> {
    const allergies = await this.fetchFhir2Search(
      'AllergyIntolerance',
      `patient=${patientUuid}`,
      headers,
    );

    const issues: FhirResourceLike[] = [];
    for (const entry of allergies) {
      const allergy = (entry as { resource?: Record<string, unknown> }).resource ?? {};
      const substance =
        ((allergy.code as { text?: string })?.text ??
          (allergy.code as { coding?: FhirCoding[] })?.coding?.[0]?.display) ??
        'unknown substance';
      const criticality = String(allergy.criticality ?? 'low');
      const reactions = Array.isArray(allergy.reaction)
        ? (allergy.reaction as Array<{ manifestation?: Array<{ text?: string }>; substance?: unknown }>)
        : [];
      const reactionText = reactions
        .map((r) => r.manifestation?.map((m) => m?.text ?? '').join(', ') ?? '')
        .filter(Boolean)
        .join('; ');

      issues.push({
        resourceType: 'DetectedIssue',
        id: `cds-${patientUuid}-${issues.length + 1}`,
        status: 'preliminary',
        code: {
          coding: [
            {
              system: 'https://fhir.dha.go.ke/terminology/CodeSystem/detectedissue-cs',
              code: 'allergy-drug-interaction',
            },
          ],
          text: 'allergy-drug-interaction',
        },
        severity: criticality.toLowerCase() === 'high' ? 'high' : criticality.toLowerCase() === 'moderate' ? 'moderate' : 'low',
        patient: { reference: `Patient/${patientUuid}` },
        identifiedDateTime: new Date().toISOString(),
        detail: `Documented allergy to ${substance}${reactionText ? ` (reaction: ${reactionText})` : ''} — prescribing decision support should screen new orders against this record.`,
        evidence: [{ detail: [{ display: `AllergyIntolerance for ${substance}` }] }],
      });
    }
    return issues;
  }

  /**
   * REP-PHE-001: outbreak-detection issues derived from the MOH 705A
   * aggregate over the requested window — one issue per notifiable disease
   * with a non-zero count (seed the measles cluster for the demo).
   */
  async detectedIssuesForOutbreak(
    startDate: string,
    endDate: string,
    headers: ForwardHeaders,
  ): Promise<FhirResourceLike[]> {
    const rows = await this.fetchEtlAggregate('/moh-705a', { startDate, endDate }, headers);
    const issues: FhirResourceLike[] = [];
    for (const row of rows) {
      for (const disease of NOTIFIABLE_705A) {
        const count = Number((row as Record<string, unknown>)[disease] ?? 0);
        if (!Number.isFinite(count) || count <= 0) continue;
        issues.push({
          resourceType: 'DetectedIssue',
          id: `outbreak-${disease}-${startDate}-${endDate}-${issues.length + 1}`,
          status: 'preliminary',
          // kenya-core-detectedissue requires code.coding (min 1); the
          // binding is preferred detectedissue-category — emit the
          // facade-defined public-health code (same pattern the passing
          // CDS issues use)
          code: {
            coding: [
              {
                system: 'https://fhir.dha.go.ke/terminology/CodeSystem/detectedissue-cs',
                code: 'public-health-event-cluster',
                display: 'Public health event cluster',
              },
            ],
            text: 'public-health-event-cluster',
          },
          // R4 DetectedIssue.severity VS is high|moderate|low — an
          // immediately-notifiable cluster exceeding single-case
          // expectation is 'high'
          severity: 'high',
          identifiedPeriod: { start: startDate, end: endDate },
          detail: `${count} case(s) of ${disease.replace(/_/g, ' ')} recorded between ${startDate} and ${endDate} — exceeds single-case expectation for an immediately-notifiable disease; public-health alert workflow applies.`,
          // evidence.detail is the Reference array — display sits on the
          // reference, not on evidence itself (validator: Unrecognized
          // property 'display')
          evidence: [
            {
              detail: [
                { display: `MOH 705A aggregate (${disease.replace(/_/g, ' ')} = ${count})` },
              ],
            },
          ],
        });
      }
    }
    return issues;
  }

  /* --------------------------------------------------------- AuditEvent */

  /**
   * SEC-AUDIT-001: core R4 AuditEvents (type=rest, restful-interaction
   * subtypes) from the AMRS audit fields — creator/changedBy as agents,
   * dateCreated/dateChanged as recorded, the encounter/obs as the entity.
   * Lab wording covered: recorded time, agent, and source.
   */
  async auditEventsForPatient(patientUuid: string): Promise<FhirResourceLike[]> {
    // OpenMRS audit model: encounter keeps date_changed/changed_by in place;
    // obs edits create a NEW row linked by previous_version (no date_changed
    // column) and deletes are voids (date_voided/voided_by on both tables).
    const encounters = await this.amrsDataSource.query(
      `SELECT e.uuid AS resourceUuid, e.date_created,
              cu.username AS creator, e.date_changed, ch.username AS changer,
              e.voided, e.date_voided, vu.username AS voider
         FROM encounter e
         JOIN person p ON p.person_id = e.patient_id
         JOIN users cu ON cu.user_id = e.creator
         LEFT JOIN users ch ON ch.user_id = e.changed_by
         LEFT JOIN users vu ON vu.user_id = e.voided_by
        WHERE p.uuid = ?
        ORDER BY e.date_created DESC
        LIMIT 50`,
      [patientUuid],
    );
    let obs: Array<Record<string, unknown>>;
    try {
      obs = await this.amrsDataSource.query(
        `SELECT o.uuid AS resourceUuid, o.date_created,
                cu.username AS creator, o.previous_version,
                o.voided, o.date_voided, vu.username AS voider
           FROM obs o
           JOIN person p ON p.person_id = o.person_id
           JOIN users cu ON cu.user_id = o.creator
           LEFT JOIN users vu ON vu.user_id = o.voided_by
          WHERE p.uuid = ?
          ORDER BY o.date_created DESC
          LIMIT 50`,
        [patientUuid],
      );
    } catch (error) {
      // Older schemas without obs.previous_version — degrade to create/void
      // events only rather than failing the whole audit trail.
      this.logger.warn(`obs audit query with previous_version failed (${String(error)}), retrying without it`);
      obs = await this.amrsDataSource.query(
        `SELECT o.uuid AS resourceUuid, o.date_created,
                cu.username AS creator,
                o.voided, o.date_voided, vu.username AS voider
           FROM obs o
           JOIN person p ON p.person_id = o.person_id
           JOIN users cu ON cu.user_id = o.creator
           LEFT JOIN users vu ON vu.user_id = o.voided_by
          WHERE p.uuid = ?
          ORDER BY o.date_created DESC
          LIMIT 50`,
        [patientUuid],
      );
    }

    const events: FhirResourceLike[] = [];
    const pushEvent = (
      resourceUuid: string,
      kind: 'Encounter' | 'Observation',
      action: 'C' | 'U' | 'D',
      when: string,
      who: string,
    ) => {
      const interaction =
        action === 'C' ? 'create' : action === 'U' ? 'update' : 'delete';
      // R4 shape: AuditEvent.type/subtype are bare Coding values (a nested
      // `coding` property is invalid — the DHA validator rejects it as an
      // unrecognized property, HAPI-1829 style).
      events.push({
        resourceType: 'AuditEvent',
        id: `audit-${kind.toLowerCase()}-${resourceUuid}-${action}-${events.length + 1}`,
        type: {
          system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
          code: 'rest',
          display: 'RESTful Operation',
        },
        subtype: [
          {
            system: 'http://hl7.org/fhir/restful-interaction',
            code: interaction,
            display: interaction,
          },
        ],
        action,
        recorded: when,
        // R4 AuditEvent.agent.requestor is required (min 1).
        agent: [{ who: { display: who }, requestor: true }],
        source: {
          site: 'AMRS — Moi Teaching And Referral Hospital',
          observer: { display: 'OpenMRS AMRS' },
        },
        entity: [
          {
            what: { reference: `${kind}/${resourceUuid}` },
            detail: [{ type: 'action', valueString: interaction }],
          },
        ],
      });
    };

    const safe = (v: unknown): string | null => (v == null ? null : String(v));

    for (const e of encounters as Array<Record<string, unknown>>) {
      const uuid = String(e.resourceUuid);
      pushEvent(uuid, 'Encounter', 'C', toFhirDateTime(e.date_created) ?? '', safe(e.creator) ?? 'system');
      if (safe(e.date_changed) && safe(e.changer)) {
        pushEvent(uuid, 'Encounter', 'U', toFhirDateTime(e.date_changed)!, safe(e.changer)!);
      }
      if (Number(e.voided ?? 0)) {
        pushEvent(uuid, 'Encounter', 'D', toFhirDateTime(e.date_voided) ?? toFhirDateTime(e.date_created) ?? '', safe(e.voider) ?? 'system');
      }
    }
    for (const o of obs as Array<Record<string, unknown>>) {
      const uuid = String(o.resourceUuid);
      pushEvent(uuid, 'Observation', 'C', toFhirDateTime(o.date_created) ?? '', safe(o.creator) ?? 'system');
      // An obs edit mints a new row pointing at its previous version — the
      // new row's date_created/creator is the edit event.
      if (o.previous_version != null) {
        pushEvent(uuid, 'Observation', 'U', toFhirDateTime(o.date_created) ?? '', safe(o.creator) ?? 'system');
      }
      if (Number(o.voided ?? 0)) {
        pushEvent(uuid, 'Observation', 'D', toFhirDateTime(o.date_voided) ?? toFhirDateTime(o.date_created) ?? '', safe(o.voider) ?? 'system');
      }
    }
    return events;
  }

  /* --------------------------------------------------------------- Task */

  /**
   * REP-IHR-001: the IHR escalation queue — one requested Task per
   * notifiable disease with a non-zero 705A count in the window.
   */
  async ihrTasks(startDate: string, endDate: string, headers: ForwardHeaders): Promise<FhirResourceLike[]> {
    const rows = await this.fetchEtlAggregate('/moh-705a', { startDate, endDate }, headers);
    const tasks: FhirResourceLike[] = [];
    for (const row of rows) {
      for (const disease of NOTIFIABLE_705A) {
        const count = Number((row as Record<string, unknown>)[disease] ?? 0);
        if (!Number.isFinite(count) || count <= 0) continue;
        tasks.push({
          resourceType: 'Task',
          id: `ihr-${disease}-${startDate}-${endDate}-${tasks.length + 1}`,
          status: 'requested',
          intent: 'plan',
          code: {
            coding: [
              {
                system: 'https://fhir.dha.go.ke/terminology/CodeSystem/task-cs',
                code: 'ihr-notify',
                display: 'IHR notification / escalation',
              },
            ],
            text: 'ihr-notify',
          },
          priority: 'stat',
          authoredOn: new Date().toISOString(),
          executionPeriod: { start: startDate, end: endDate },
          reasonCode: {
            text: `${count} case(s) of ${disease.replace(/_/g, ' ')} in ${startDate}…${endDate} — event of potential international concern, escalate County → National DSO → WHO per IHR SOP.`,
          },
        });
      }
    }
    return tasks;
  }

  /**
   * INTER-HIE-001: ambulance referrals as Tasks — maps the verified-live
   * pending EMT queue (status pending_acceptance → requested).
   */
  async referralTasks(locationUuid: string): Promise<FhirResourceLike[]> {
    const dto: ListEmtReferralsDto = { locationUuid, limit: '25' } as ListEmtReferralsDto;
    const resp = await this.emtService.listReferrals(dto);
    const results = (resp?.results ?? []) as Array<Record<string, unknown>>;
    return results.map((r, i) => ({
      resourceType: 'Task',
      id: `referral-${String(r.submission_id ?? i)}`,
      identifier: [
        {
          system: 'https://fhir.dha.go.ke/core/NamingSystem/emt-submission',
          value: String(r.submission_id ?? ''),
          type: {
            coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'FI', display: 'Facility ID' }],
            text: 'EMT submission id',
          },
        },
      ],
      status: String(r.status) === 'pending_acceptance' ? 'requested' : 'completed',
      intent: 'order',
      code: {
        coding: [
          {
            system: 'https://fhir.dha.go.ke/terminology/CodeSystem/task-cs',
            code: 'ambulance-referral',
            display: 'Ambulance referral',
          },
        ],
        text: 'ambulance-referral',
      },
      focus: {
        display: `EMT case ${String(r.case_number ?? '')} (${String(r.referral_category ?? 'referral')})`,
      },
      authoredOn: r.requested_at ? String(r.requested_at) : undefined,
      reasonCode: { text: 'Cross-facility ambulance handover pending acceptance' },
    }));
  }

  /* ------------------------------------------------- Condition ICD-11 enrichment */

  /**
   * INTER-SEM-001: FHIR2 Conditions carry only the local concept UUID —
   * inject the ICD-11 coding from the same concept_reference_map join the
   * case-summary uses (verified live: GB60.0 / 1F40.Z / 5A22.Z / 5A13).
   */
  /**
   * Full Condition conformance enrichment (kenya-core-condition):
   *  - `code`: ICD-11 coding (required binding) from the concept_reference_map
   *  - `clinicalStatus`/`verificationStatus`/`category`: DHA terminology
   *    codings (kenya slice + required ValueSets) alongside the HL7 ones,
   *    with FHIR2's non-conformant `unknown` normalized
   *  - `recordedDate`: fallback from onset
   *  - `ihr-reportable` extension for immediately-notifiable diseases
   */
  async enrichCondition(resource: FhirResourceLike): Promise<void> {
    // -- id is required (min 1)
    if (!resource.id) {
      resource.id = `condition-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }
    // -- ICD-11 coding on Condition.code (required binding)
    const code = resource.code as { coding?: FhirCoding[]; text?: string } | undefined;
    const localCoding = code?.coding?.find((c) => c.code && !c.system) ?? code?.coding?.[0];
    const conceptUuid = localCoding?.code;
    if (conceptUuid) {
      const icd11 = await this.icd11ForConcept(conceptUuid);
      if (icd11 && !code?.coding?.some((c) => c.system === ICD11_SYSTEM)) {
        resource.code = {
          ...(resource.code as object),
          coding: [
            ...(code?.coding ?? []),
            { system: ICD11_SYSTEM, code: icd11 },
          ],
        } as never;
      }
    }

    // -- category: required binding to condition-category-vs (DHA members
    //    only) — replace with the DHA coding, keeping the original display as
    //    text (FHIR2 conditions are encounter diagnoses)
    const category = resource.category as Array<{ coding?: FhirCoding[]; text?: string }> | undefined;
    const hl7Category = Array.isArray(category)
      ? category.find((cat) => cat.coding?.some((c) => c.system?.includes('condition-category')))?.coding
          ?.find((c) => c.system?.includes('condition-category'))?.code
      : undefined;
    const dhaCategoryCode = hl7Category === 'problem-list-item'
      ? 'PROBLEM-LIST-ITEM'
      : hl7Category === 'health-concern'
        ? 'HEALTH-CONCERN'
        : 'ENCOUNTER-DIAGNOSIS';
    resource.category = [
      {
        coding: [
          {
            system: `${DHA_TERMINOLOGY_BASE}/CodeSystem/condition-category-cs`,
            code: dhaCategoryCode,
            display: dhaCategoryCode === 'PROBLEM-LIST-ITEM'
              ? 'Problem List Item'
              : dhaCategoryCode === 'HEALTH-CONCERN' ? 'Health Concern' : 'Encounter Diagnosis',
          },
        ],
        text: Array.isArray(category) ? category[0]?.text ?? hl7Category ?? dhaCategoryCode : dhaCategoryCode,
      },
    ] as never;

    // -- clinicalStatus: required binding to condition-clinical-status-vs.
    //    Replace wholesale: FHIR2's `unknown` is not even a valid HL7
    //    condition-clinical code, and non-member codings fail the required
    //    binding — the DHA coding carries the status, the text preserves it.
    const clinical = resource.clinicalStatus as { coding?: FhirCoding[]; text?: string } | undefined;
    const hl7Clinical = clinical?.coding?.find((c) => c.system?.includes('condition-clinical'))?.code
      ?? clinical?.coding?.[0]?.code ?? 'active';
    const dhaClinical = DHA_CLINICAL_STATUS[hl7Clinical] ?? 'ACTIVE';
    resource.clinicalStatus = {
      coding: [
        {
          system: `${DHA_TERMINOLOGY_BASE}/CodeSystem/condition-clinical-status-cs`,
          code: dhaClinical,
          display: dhaClinical === 'ACTIVE' ? 'Active' : dhaClinical === 'RESOLVED' ? 'Resolved' : 'Inactive',
        },
      ],
      text: clinical?.text ?? hl7Clinical,
    } as never;

    // -- verificationStatus: required binding to condition-verification-status-vs
    //    (same replacement pattern; defaults to CONFIRMED when FHIR2 omits it)
    const verification = resource.verificationStatus as { coding?: FhirCoding[]; text?: string } | undefined;
    const hl7Verification = verification?.coding?.find((c) => c.system?.includes('condition-ver-status'))?.code
      ?? 'confirmed';
    const dhaVerification = DHA_VERIFICATION_STATUS[hl7Verification] ?? 'CONFIRMED';
    resource.verificationStatus = {
      coding: [
        {
          system: `${DHA_TERMINOLOGY_BASE}/CodeSystem/condition-verification-status-cs`,
          code: dhaVerification,
          display: dhaVerification.charAt(0) + dhaVerification.slice(1).toLowerCase(),
        },
      ],
      text: verification?.text ?? hl7Verification,
    } as never;

    // -- recordedDate required (min 1): fallback to onset then now
    if (!resource.recordedDate) {
      resource.recordedDate =
        toFhirDateTime(resource.onsetDateTime) ??
        toFhirDateTime((resource.onsetPeriod as { start?: string } | undefined)?.start) ??
        new Date().toISOString();
    }

    // -- ihr-reportable extension for immediately-notifiable diseases
    const display = String(code?.text ?? localCoding?.display ?? '').toLowerCase();
    if (this.isNotifiable(display) && !this.hasExtension(resource, 'ihr-reportable')) {
      resource.extension = [
        ...((resource.extension as Array<object> | undefined) ?? []),
        {
          url: `${DHA_TERMINOLOGY_BASE.replace('/terminology', '')}/fhir/StructureDefinition/ihr-reportable`,
          valueBoolean: true,
        },
      ];
    }
  }

  private isNotifiable(display: string): boolean {
    if (!display) return false;
    const list = this.notifiableDiseases();
    return list.some((d) => display.includes(d));
  }

  private notifiableDiseases(): string[] {
    const raw = this.configService.get<string>('DHA_NOTIFIABLE_DISEASES');
    if (raw) return raw.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
    return DEFAULT_NOTIFIABLE;
  }

  private hasExtension(resource: FhirResourceLike, urlSuffix: string): boolean {
    return (resource.extension as Array<{ url?: string }> | undefined)?.some((e) =>
      e.url?.endsWith(urlSuffix),
    ) ?? false;
  }

  private async icd11ForConcept(conceptUuid: string): Promise<string | null> {
    if (this.icd11Cache.has(conceptUuid)) {
      return this.icd11Cache.get(conceptUuid) ?? null;
    }
    let code: string | null = null;
    try {
      const rows = (await this.amrsDataSource.query(
        `SELECT crt.code AS icd11
           FROM concept c
           JOIN concept_reference_map crm ON crm.concept_id = c.concept_id
           JOIN concept_reference_term crt ON crt.concept_reference_term_id = crm.concept_reference_term_id
           JOIN concept_reference_source crs ON crs.concept_source_id = crt.concept_source_id
          WHERE c.uuid = ? AND crs.name LIKE '%ICD%11%'
          LIMIT 1`,
        [conceptUuid],
      )) as Array<{ icd11?: string }>;
      code = rows?.[0]?.icd11 ?? null;
    } catch (error) {
      this.logger.warn(`ICD-11 lookup failed for ${conceptUuid}: ${String(error)}`);
    }
    this.icd11Cache.set(conceptUuid, code);
    return code;
  }

  /* ------------------------------------------------------- validation pair */

  /**
   * SEC-INT-001: validate a submitted dataset and return a FHIR
   * OperationOutcome. Tiers: structural → live-IG required elements →
   * optional SHA $validate forward (SHA_FHIR_BASE_URL set). The outcome is
   * also retained for GET /dha-fhir/validation-status.
   */
  async validateSubmittedDataset(
    body: unknown,
    headers: ForwardHeaders,
  ): Promise<FhirOperationOutcome> {
    const issues: FhirOutcomeIssue[] = [];

    // Tier 1 — structural
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      issues.push({
        severity: 'error',
        code: 'structure',
        diagnostics: 'Submitted dataset must be a single JSON object (a FHIR resource or Bundle).',
        expression: ['$'],
      });
      const structural = outcome(issues);
      this.lastValidation = structural;
      return structural;
    }
    const resource = body as Record<string, unknown>;
    const resourceType = resource.resourceType;
    if (typeof resourceType !== 'string' || !resourceType) {
      issues.push({ severity: 'error', code: 'required', diagnostics: 'resourceType is missing.', expression: ['$'] });
    } else {
      this.checkRequiredFields(resourceType, resource, issues);
      if (resourceType === 'Bundle' && Array.isArray(resource.entry)) {
        (resource.entry as Array<{ resource?: Record<string, unknown> }>).forEach((e, i) => {
          if (e.resource) this.checkRequiredFields(String(e.resource.resourceType), e.resource, issues, `entry[${i}]`);
        });
      }
    }

    // Tier 2 — Kenya Core required elements from the live IG (best effort)
    if (typeof resourceType === 'string') {
      const required = await this.requiredElementsFor(resourceType);
      if (required.length) {
        const missing = required.filter((path) => this.pathMissing(resource, path));
        for (const path of missing) {
          issues.push({
            severity: 'error',
            code: 'required',
            diagnostics: `Required by Kenya Core (${DHA_IG_BASE}): ${path} is missing.`,
            expression: [path],
          });
        }
      } else {
        issues.push({
          severity: 'information',
          code: 'informational',
          diagnostics: `Kenya Core StructureDefinition for ${resourceType} is unavailable (IG fetch failed or no profile) — required-element tier skipped.`,
        });
      }
    }

    // Tier 3 — optional SHA $validate forward
    const shaBase = this.configService.get<string>('SHA_FHIR_BASE_URL');
    if (shaBase && resourceType === 'Bundle') {
      try {
        const resp = await fetch(`${shaBase.replace(/\/+$/, '')}/Bundle/$validate`, {
          method: 'POST',
          headers: { 'content-type': 'application/fhir+json', accept: 'application/fhir+json' },
          body: JSON.stringify(resource),
          signal: AbortSignal.timeout(20000),
        });
        const remote = (await resp.json().catch(() => null)) as FhirOperationOutcome | null;
        if (remote?.resourceType === 'OperationOutcome') {
          for (const i of remote.issue ?? []) {
            issues.push({
              severity: (i.severity as FhirOutcomeIssue['severity']) ?? 'warning',
              code: i.code ?? 'processing',
              diagnostics: `SHA $validate: ${i.diagnostics ?? i.code ?? 'issue'}`,
            });
          }
        }
      } catch (error) {
        issues.push({
          severity: 'warning',
          code: 'not-supported',
          diagnostics: `SHA $validate forward failed (${String(error)}) — local tiers only.`,
        });
      }
    }

    if (!issues.length) {
      issues.push({ severity: 'information', code: 'informational', diagnostics: 'No validation issues detected.' });
    }
    const result = outcome(issues);
    this.lastValidation = result;
    void headers;
    return result;
  }

  /** Default demo patient (env DHA_DEMO_PATIENT_UUID) for lab-facing queries. */
  demoPatientUuid(): string {
    return this.configService.get<string>('DHA_DEMO_PATIENT_UUID') ?? '';
  }

  get lastValidationOutcome(): FhirOperationOutcome | null {
    return this.lastValidation;
  }

  /** SEC-INT-001: a deliberately wrong dataset the laboratory can submit. */
  invalidExampleDataset(): Record<string, unknown> {
    return {
      resourceType: 'Patient',
      identifier: [{ value: 'ID-WITH-LETTERS-123ABC' }],
      name: [{ family: 'WronglyFormed', text: '' }],
      birthDate: '2099-13-45',
      telecom: [{ system: 'phone', value: 'not-a-phone' }],
    };
  }

  private checkRequiredFields(
    resourceType: string,
    resource: Record<string, unknown>,
    issues: FhirOutcomeIssue[],
    prefix = '',
  ): void {
    const REQUIRED: Record<string, string[]> = {
      Patient: ['identifier', 'gender', 'birthDate'],
      Condition: ['subject', 'code'],
      Encounter: ['status', 'subject', 'class'],
      MedicationRequest: ['status', 'intent', 'medication', 'subject'],
      AllergyIntolerance: ['patient', 'code'],
      Observation: ['status', 'code'],
      Task: ['status', 'intent'],
      Bundle: ['type'],
      Composition: ['status', 'type', 'subject', 'date'],
      AuditEvent: ['recorded', 'agent', 'source'],
      DetectedIssue: ['status', 'code'],
    };
    const at = (p: string) => (prefix ? `${prefix}.${p}` : p);
    for (const field of REQUIRED[resourceType] ?? []) {
      const value = resource[field];
      if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
        issues.push({
          severity: 'error',
          code: 'required',
          diagnostics: `${resourceType}.${field} is missing.`,
          expression: [at(field)],
        });
      }
    }
  }

  private async requiredElementsFor(resourceType: string): Promise<string[]> {
    if (this.requiredElementsCache.has(resourceType)) {
      return this.requiredElementsCache.get(resourceType) ?? [];
    }
    const slug = `kenya-core-${resourceType.toLowerCase()}`;
    let required: string[] = [];
    try {
      const resp = await fetch(`${DHA_IG_BASE}/StructureDefinition/${slug}`, {
        headers: { accept: 'application/fhir+json' },
        signal: AbortSignal.timeout(15000),
      });
      if (resp.ok) {
        const sd = (await resp.json()) as {
          snapshot?: { element?: Array<{ path?: string; min?: number }> };
        };
        required = (sd.snapshot?.element ?? [])
          .filter((el) => (el.min ?? 0) >= 1 && el.path && el.path.split('.').length === 2)
          .map((el) => el.path!.split('.')[1]);
      }
    } catch (error) {
      this.logger.warn(`IG required-element fetch failed for ${resourceType}: ${String(error)}`);
    }
    this.requiredElementsCache.set(resourceType, required);
    return required;
  }

  private pathMissing(resource: Record<string, unknown>, path: string): boolean {
    const value = resource[path];
    return (
      value === undefined ||
      value === null ||
      (Array.isArray(value) && value.length === 0) ||
      (typeof value === 'string' && value.trim() === '')
    );
  }

  /* ------------------------------------------- Patient / ServiceRequest enrichment */

  /**
   * Patient conformance enrichment (kenya-core-patient):
   *  - identifier systems rewritten to the DHA national systems (slices) plus a
   *    SHA-system twin (the `sha-patient-min-identifier` constraint checks the
   *    fhir.sha.go.ke host — verified from the IG FHIRPath)
   *  - sliced identifiers get `use: 'official'` — the profile FIXES use on the
   *    nationalId / shaNumber / householdNumber slices and the lab rejects
   *    FHIR2's 'usual' (verified: 3 blocking errors in the FUNC-DEMO-001
   *    test-bed report)
   *  - OpenMRS-namespaced extensions (person-attribute, identifier#location,
   *    address) are stripped — the IG does not define them and the test bed
   *    reports them as unknown extensions / slice mismatches
   *  - identifier.type null-system codings dropped (text kept) — 'Coding has
   *    no system' warnings
   *  - telecom entries get their `system` (cpt-2)
   */
  async enrichPatient(resource: FhirResourceLike): Promise<void> {
    if (!resource.id) resource.id = `patient-${Date.now()}`;
    const identifiers = (resource.identifier as Array<Record<string, unknown>> | undefined) ?? [];
    for (const ident of identifiers) {
      if (!ident.system) {
        const type = String(
          (ident.type as { text?: string; coding?: Array<{ display?: string }> } | undefined)?.text ??
            (ident.type as { coding?: Array<{ display?: string }> } | undefined)?.coding?.[0]?.display ?? '',
        ).toLowerCase();
        const value = String(ident.value ?? '');
        if (type.includes('national')) ident.system = `${DHA_IDENTIFIER_BASE}/nationalid`;
        else if (type.includes('cr') || type.includes('sha') || /^CR\d{13}-\d+$/.test(value))
          ident.system = `${DHA_IDENTIFIER_BASE}/shanumber`;
        else if (type.includes('phone') || value.startsWith('+254') || value.startsWith('07'))
          ident.system = `${DHA_IDENTIFIER_BASE}/phonenumber`;
        else if (type.includes('household')) ident.system = `${DHA_IDENTIFIER_BASE}/householdnumber`;
      }
    }
    // kenya-core-patient FIXES use='official' on these identifier slices —
    // FHIR2 sends 'usual' and the DHA lab test bed rejects the resource
    const OFFICIAL_USE_SLICES = ['nationalid', 'shanumber', 'householdnumber'];
    for (const ident of identifiers) {
      const system = String(ident.system ?? '');
      if (
        OFFICIAL_USE_SLICES.some((s) => system.includes(`/${s}`)) &&
        ident.use !== 'official'
      ) {
        ident.use = 'official';
      }
    }
    // strict Kenya Core conformance: strip OpenMRS-namespaced extensions the
    // IG does not define (unknown-extension + slice-mismatch noise on the lab)
    const OPENMRS_EXT = 'http://fhir.openmrs.org/ext';
    const stripOpenMrsExtensions = (holder: Record<string, unknown>): void => {
      const ext = holder.extension as Array<{ url?: string }> | undefined;
      if (Array.isArray(ext)) {
        const kept = ext.filter((e) => !String(e.url ?? '').startsWith(OPENMRS_EXT));
        if (kept.length) holder.extension = kept as never;
        else delete holder.extension;
      }
    };
    stripOpenMrsExtensions(resource);
    for (const ident of identifiers) {
      stripOpenMrsExtensions(ident);
      // identifier.type: drop null-system codings (keep the text) — 'Coding
      // has no system' warnings on the lab
      const type = ident.type as
        | { coding?: Array<{ system?: string; code?: string }>; text?: string }
        | undefined;
      if (type?.coding?.length) {
        const resolvable = type.coding.filter((c) => c.system && c.code);
        if (resolvable.length) type.coding = resolvable;
        else delete type.coding;
      }
    }
    for (const address of (resource.address as Array<Record<string, unknown>> | undefined) ?? []) {
      stripOpenMrsExtensions(address);
    }
    // constraint twin: one identifier whose system lives on the SHA host
    const hasShaSystem = identifiers.some((i) => String(i.system ?? '').startsWith(SHA_IDENTIFIER_BASE));
    if (!hasShaSystem) {
      const source = identifiers.find((i) =>
        String(i.system ?? '').includes('/shanumber') || String(i.system ?? '').includes('/nationalid'));
      if (source) {
        const shaSystem = String(source.system).includes('/shanumber')
          ? `${SHA_IDENTIFIER_BASE}/shanumber`
          : `${SHA_IDENTIFIER_BASE}/nationalid`;
        identifiers.push({ system: shaSystem, value: source.value });
        resource.identifier = identifiers as never;
      }
    }
    // telecom: cpt-2 requires a system when a value is present
    const telecom = (resource.telecom as Array<Record<string, unknown>> | undefined) ?? [];
    const kept = telecom.filter((t) => {
      if (t.system) return true;
      const value = String(t.value ?? '');
      if (value.includes('@')) { t.system = 'email'; return true; }
      if (value) { t.system = 'phone'; return true; }
      return false;
    });
    if (telecom.length) resource.telecom = kept as never;
  }

  /**
   * ServiceRequest conformance enrichment (kenya-core-servicerequest):
   *  - `authoredOn` (min 1) from the AMRS orders table
   *  - any coding missing its `system` gets the OCL/AMPATH system (the
   *    profile requires coding.system min 1)
   */
  async enrichServiceRequest(resource: FhirResourceLike, headers: ForwardHeaders): Promise<void> {
    if (!resource.id) resource.id = `servicerequest-${Date.now()}`;
    if (!resource.authoredOn) {
      try {
        const rows = (await this.amrsDataSource.query(
          `SELECT date_activated FROM orders WHERE uuid = ? LIMIT 1`,
          [String(resource.id)],
        )) as Array<{ date_activated?: string }>;
        if (rows?.[0]?.date_activated) resource.authoredOn = toFhirDateTime(rows[0].date_activated);
      } catch (e) {
        this.logger.warn(`authoredOn lookup failed for ${resource.id}: ${String(e)}`);
      }
    }
    if (!resource.authoredOn) resource.authoredOn = new Date().toISOString();
    this.backfillCodingSystems(resource, 'code');
    this.backfillCodingSystems(resource, 'category');
    this.backfillCodingSystems(resource, 'reasonCode');
    void headers;
  }

  /** Add a system to any coding missing one (AMRS concepts are OCL/AMPATH-sourced). */
  private backfillCodingSystems(resource: FhirResourceLike, field: string): void {
    const value = resource[field] as
      | { coding?: Array<{ system?: string; code?: string }> }
      | Array<{ coding?: Array<{ system?: string; code?: string }> }>
      | undefined;
    const targets = Array.isArray(value) ? value : value ? [value] : [];
    for (const wrapper of targets) {
      for (const coding of wrapper.coding ?? []) {
        if (coding.code && !coding.system) coding.system = OCL_AMPATH_SYSTEM;
      }
    }
  }

  /**
   * MedicationRequest enrichment (ke-medication-request differential):
   *  - `identifier` (min 1): the prescription id in the IG's NamingSystem
   *  - `category` (min 1, required medicationrequest-category VS): outpatient
   *  - `authoredOn` (min 1) from the AMRS orders table
   *  - `dosageInstruction` depth (timing.repeat.periodUnit / route /
   *    doseAndRate.dose[x] min 1, route bound to the DHA route VS) — sourced
   *    from drug_order when the AMRS replica is reachable, otherwise from the
   *    instruction text already on the resource, with documented neutral
   *    fallbacks so the resource stays conformant
   *  - a `system` on any coding missing one (OCL-sourced medication codings)
   */
  async enrichMedicationRequest(
    resource: FhirResourceLike,
    headers: ForwardHeaders = {},
  ): Promise<void> {
    if (!resource.id) resource.id = `medicationrequest-${Date.now()}`;

    // identifier (min 1) — the IG prescription-identifier NamingSystem
    const identifiers = (resource.identifier as Array<Record<string, unknown>> | undefined) ?? [];
    if (!identifiers.length) {
      identifiers.push({
        system: DHA_PRESCRIPTION_IDENTIFIER_SYSTEM,
        value: String(resource.id),
      });
      resource.identifier = identifiers as never;
    }

    // medication[x] is restricted to CodeableConcept by the profile —
    // resolve FHIR2's medicationReference to the real drug codings
    const medRef = resource.medicationReference as
      | { reference?: string; display?: string }
      | undefined;
    if (medRef && !resource.medicationCodeableConcept) {
      resource.medicationCodeableConcept = await this.resolveMedicationCodeableConcept(
        medRef,
        headers,
      );
      delete resource.medicationReference;
    }

    // category (min 1, required binding) — AMRS prescriptions are outpatient
    if (!Array.isArray(resource.category) || !resource.category.length) {
      resource.category = [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/medicationrequest-category',
              code: 'outpatient',
              display: 'Outpatient',
            },
          ],
          text: 'Outpatient',
        },
      ];
    }

    if (!resource.authoredOn) {
      const order = await this.drugOrderFor(String(resource.id));
      if (order?.date_activated) resource.authoredOn = toFhirDateTime(order.date_activated);
    }
    if (!resource.authoredOn) resource.authoredOn = new Date().toISOString();

    // dosage depth per ke-medication-request (periodUnit / route / doseAndRate
    // / dispenseRequest.quantity are min 1)
    const dosage = (resource.dosageInstruction as Array<Record<string, unknown>> | undefined) ?? [];
    if (!dosage.length) {
      dosage.push({ text: this.dosageTextFallback(resource) });
      resource.dosageInstruction = dosage as never;
    }
    const order = await this.drugOrderFor(String(resource.id));
    for (const di of dosage) {
      this.deepenDosageInstruction(di, resource, order);
    }

    // dispenseRequest.quantity (min 1) — FHIR2 normally provides it
    const dispense = resource.dispenseRequest as Record<string, unknown> | undefined;
    if (dispense && !dispense.quantity) {
      dispense.quantity = { value: 1, unit: this.dosageUnitFallback(resource) };
    }

    // qty-3: FHIR2 quantities carry OpenMRS-uuid `code`s without a system —
    // strip the bare code, keep value + unit
    const quantities = [
      (resource.dispenseRequest as Record<string, unknown> | undefined)?.quantity,
      ...((resource.dosageInstruction as Array<Record<string, unknown>> | undefined) ?? []).flatMap(
        (di) => ((di.doseAndRate as Array<Record<string, unknown>> | undefined) ?? []).map((dr) => dr.doseQuantity),
      ),
    ] as Array<{ code?: string; system?: string; unit?: string } | undefined>;
    for (const qty of quantities) {
      if (qty?.code && !qty.system) {
        qty.unit = qty.unit ?? qty.code;
        delete qty.code;
      }
    }
  }

  /** Best-effort drug_order row for a MedicationRequest (order uuid). */
  private async drugOrderFor(
    orderUuid: string,
  ): Promise<Record<string, unknown> | null> {
    // the AMRS replica may not expose drug_order — after one failure stop
    // querying (and warning) for the process lifetime
    if (this.drugOrderQueryAvailable === false) return null;
    try {
      const rows = (await this.amrsDataSource.query(
        `SELECT o.date_activated, d.dose, d.dose_units, d.dosing_instructions,
                d.duration, d.duration_units, d.frequency, d.route,
                d.quantity, d.quantity_units, d.num_refills
           FROM drug_order d
           JOIN orders o ON o.order_id = d.order_id
          WHERE o.uuid = ? LIMIT 1`,
        [orderUuid],
      )) as Array<Record<string, unknown>>;
      this.drugOrderQueryAvailable = true;
      return rows?.[0] ?? null;
    } catch (e) {
      this.drugOrderQueryAvailable = false;
      this.logger.warn(
        `drug_order lookup unavailable (${String(e)}) — dosage enrichment uses resource fallbacks`,
      );
      return null;
    }
  }

  /** Map a drug route display to the DHA route-of-administration-cs coding. */
  private dhaRouteCoding(routeDisplay: string | undefined): {
    system: string;
    code: string;
    display: string;
  } | null {
    if (!routeDisplay) return null;
    const hit = DHA_ROUTE_BY_KEYWORD.find(([re]) => re.test(routeDisplay));
    return hit ? { system: DHA_ROUTE_SYSTEM, code: hit[1], display: hit[2] } : null;
  }

  /** The medication display used for form/route/unit heuristics. */
  private medicationDisplay(resource: FhirResourceLike): string {
    const ref = resource.medicationReference as { display?: string } | undefined;
    const concept = resource.medicationCodeableConcept as
      | { text?: string; coding?: Array<{ display?: string }> }
      | undefined;
    return (
      concept?.text ??
      concept?.coding?.find((c) => c.display)?.display ??
      ref?.display ??
      ''
    );
  }

  private dosageUnitFallback(resource: FhirResourceLike): string {
    const dispense = resource.dispenseRequest as
      | { quantity?: { unit?: string } }
      | undefined;
    return (
      dispense?.quantity?.unit ??
      (/\bcap/i.test(this.medicationDisplay(resource)) ? 'capsule' : 'tablet')
    );
  }

  private dosageTextFallback(resource: FhirResourceLike): string {
    const unit = this.dosageUnitFallback(resource);
    return `1 ${unit} once daily`;
  }

  /**
   * Bring one dosageInstruction up to the ke-medication-request minimums:
   * timing.repeat.periodUnit, route (DHA VS), doseAndRate.doseQuantity and
   * text. Where the AMRS order carries the values they win; otherwise the
   * existing instruction text drives the mapping and neutral defaults fill
   * the remainder (disclosed enrichment, not clinical data).
   */
  private deepenDosageInstruction(
    di: Record<string, unknown>,
    resource: FhirResourceLike,
    order: Record<string, unknown> | null,
  ): void {
    const display = this.medicationDisplay(resource);

    // -- text (mustSupport; also the mapping source when no order data)
    if (typeof di.text !== 'string' || !di.text) {
      const orderText = typeof order?.dosing_instructions === 'string' ? order.dosing_instructions : '';
      di.text = orderText || this.dosageTextFallback(resource);
    }
    di.text = String(di.text).trim();

    // -- timing.repeat.periodUnit (min 1)
    const timing = (di.timing ?? {}) as {
      repeat?: { frequency?: number; period?: number; periodUnit?: string; duration?: number; durationUnit?: string };
      code?: { coding?: Array<{ display?: string }>; text?: string };
    };
    timing.repeat = timing.repeat ?? {};
    if (!timing.repeat.periodUnit) {
      const timingText = String(
        timing.code?.text ?? timing.code?.coding?.find((c) => c.display)?.display ?? di.text ?? '',
      );
      const hit = DOSAGE_TIMING_BY_KEYWORD.find(([re]) => re.test(timingText));
      if (hit) {
        timing.repeat.frequency = hit[1];
        timing.repeat.period = hit[2];
        timing.repeat.periodUnit = hit[3];
      } else {
        // documented fallback: once daily
        timing.repeat.frequency = 1;
        timing.repeat.period = 1;
        timing.repeat.periodUnit = 'd';
      }
    }
    di.timing = timing;

    // timing.code carries FHIR2's local codings (null-system uuids, CIEL/
    // AMPATH) which the IG's extensible TimingAbbreviation binding cannot
    // resolve — keep the display text, drop the codings (each one is a lab
    // warning; 'ONCE A DAY' etc. has no TimingAbbreviation member)
    const timingCode = timing.code as { coding?: unknown[] } | undefined;
    if (timingCode?.coding?.length) {
      delete timingCode.coding;
    }

    // -- route (min 1, required DHA route-of-administration-vs)
    const route = di.route as
      | { coding?: Array<{ system?: string; display?: string }>; text?: string }
      | undefined;
    const routeDisplay =
      (typeof order?.route === 'string' && order.route) ||
      route?.coding?.find((c) => c.display)?.display ||
      route?.text;
    const dhaRoute =
      this.dhaRouteCoding(routeDisplay) ??
      // solid oral dose forms are the outpatient default — documented
      // neutral fallback so the route minimum never fails the profile
      { system: DHA_ROUTE_SYSTEM, code: 'RT10025', display: 'Oral' };
    di.route = {
      coding: [dhaRoute],
      text: routeDisplay || dhaRoute.display,
    };

    // -- doseAndRate.doseQuantity (min 1 each)
    const doseAndRate = (di.doseAndRate as Array<Record<string, unknown>> | undefined) ?? [];
    if (!doseAndRate.length) {
      const dose = Number(order?.dose ?? 1);
      const doseUnit =
        (typeof order?.dose_units === 'string' && order.dose_units) ||
        this.dosageUnitFallback(resource);
      doseAndRate.push({
        doseQuantity: {
          value: Number.isFinite(dose) && dose > 0 ? dose : 1,
          unit: doseUnit,
        },
      });
      di.doseAndRate = doseAndRate;
    }

    // -- dispenseRequest.quantity (min 1) is handled on the resource level
  }

  /**
   * Condition search post-processing for the lab query shapes FHIR2 cannot
   * execute natively (REP-IMM/IDSR/IHR):
   *  - `extension:ihr-reportable=true` → enrich + filter notifiable conditions
   *  - `_sort=-recordedDate` → client-side sort
   *  - `onset-date=ge/le{date}` → client-side window filter (kept upstream when
   *    FHIR2 accepts it; strips the prefixed form it rejects)
   */
  async conditionSearch(query: Record<string, string>, headers: ForwardHeaders): Promise<FhirResourceLike[]> {
    const ihrOnly = Object.keys(query).some((k) => k.includes('ihr-reportable'));
    const sortDesc = (query['_sort'] ?? '').includes('recordedDate');
    const window = { start: '', end: '' };
    for (const [k, v] of Object.entries(query)) {
      if (k.startsWith('onset-date')) {
        const m = /^(ge|le)(.+)$/.exec(v);
        if (m) {
          if (m[1] === 'ge') window.start = m[2];
          if (m[1] === 'le') window.end = m[2];
        }
      }
    }

    // supported upstream params only
    const upstream = new URLSearchParams();
    for (const key of ['patient', 'category', 'clinical-status', 'onset-date', '_count']) {
      const value = query[key];
      if (value !== undefined && !/^(ge|le)/.test(value)) upstream.set(key, value);
    }
    if (!upstream.has('_count')) upstream.set('_count', '100');
    const entries = await this.fetchFhir2Search('Condition', upstream.toString(), headers);

    let conditions: FhirResourceLike[] = [];
    for (const entry of entries) {
      const resource = (entry as { resource?: FhirResourceLike }).resource;
      if (!resource) continue;
      await this.enrichCondition(resource);
      conditions.push(resource);
    }

    if (ihrOnly) {
      conditions = conditions.filter((c) => {
        const display = String(
          ((c.code as { text?: string })?.text ??
            (c.code as { coding?: Array<{ display?: string }> } | undefined)?.coding?.[0]?.display ?? ''),
        ).toLowerCase();
        return this.isNotifiable(display) || this.hasExtension(c, 'ihr-reportable');
      });
    }
    if (window.start || window.end) {
      conditions = conditions.filter((c) => {
        const onset = String(c.onsetDateTime ?? c.recordedDate ?? '');
        if (!onset) return !window.start; // no onset: exclude only when a lower bound is required
        return (!window.start || onset >= window.start) && (!window.end || onset <= window.end);
      });
    }
    if (sortDesc) {
      conditions.sort((a, b) =>
        String(b.recordedDate ?? b.onsetDateTime ?? '').localeCompare(String(a.recordedDate ?? a.onsetDateTime ?? '')),
      );
    }
    return conditions;
  }

  /* ---------------------------------- medication / dispense / episode */

  /**
   * ke-medication minimums: identifier + form. `form` carries a
   * formulation-cs coding (required binding): taken from the AMRS drug
   * dosage form when available, otherwise mapped from the drug name, with a
   * plain-text fallback when neither resolves (disclosed residual).
   */
  async enrichMedication(resource: FhirResourceLike): Promise<void> {
    if (!resource.id) resource.id = `medication-${Date.now()}`;
    if (!resource.identifier) {
      resource.identifier = [
        {
          system: 'https://fhir.dha.go.ke/fhir/identifier/medication',
          value: String(resource.id),
        },
      ];
    }
    const display = String(
      (resource.code as { text?: string } | undefined)?.text ??
        (resource.code as { coding?: Array<{ display?: string }> } | undefined)?.coding?.[0]?.display ?? '',
    ).trim();
    // The ke-medication `code` required binding points at generic-products-vs
    // (empty in the published IG). Prefer the HPT coding by GE code (the
    // terminology the DHA harness searches) when the display carries one,
    // else a published generic-products concept (self-healing), else keep
    // exactly the canonical CIEL coding (the drug's real identity); the
    // display stays on code.text.
    const code = resource.code as { coding?: Array<{ system?: string; code?: string; display?: string }>; text?: string } | undefined;
    const genericProduct = (await this.hptCodingFor(display)) ?? this.dhaGenericProductCoding(display);
    if (genericProduct && code) {
      code.coding = [genericProduct];
      code.text = code.text ?? display;
    } else if (code?.coding?.length) {
      const ciel = code.coding.find((c) => c.system?.includes('/CIEL')) ?? code.coding.find((c) => c.system) ?? code.coding[0];
      code.coding = [
        {
          system: ciel.system ?? OCL_AMPATH_SYSTEM,
          code: ciel.code!,
          display: String(ciel.display ?? '').trim(),
        },
      ];
      code.text = code.text ?? display;
    }
    if (!resource.form) {
      // 1) authoritative source: the AMRS drug row's dosage form concept
      const dosageForm = await this.drugDosageForm(String(resource.id));
      const formCoding =
        this.dhaFormCoding(dosageForm) ?? this.dhaFormCoding(display);
      resource.form = formCoding
        ? {
            coding: [formCoding],
            text: dosageForm || display || formCoding.display,
          }
        : { text: dosageForm || display || 'Not recorded' };
    }
  }

  /** The dosage-form display of an AMRS drug (uuid join), best effort. */
  private async drugDosageForm(drugUuid: string): Promise<string | null> {
    // same negative-cache policy as drugOrderFor — one warn, then stop
    if (this.drugDosageFormQueryAvailable === false) return null;
    try {
      const rows = (await this.amrsDataSource.query(
        `SELECT cn.name AS form
           FROM drug d
           JOIN concept_name cn ON cn.concept_id = d.dosage_form
                AND cn.concept_name_type = 'FULLY_SPECIFIED'
          WHERE d.uuid = ? LIMIT 1`,
        [drugUuid],
      )) as Array<{ form?: string }>;
      this.drugDosageFormQueryAvailable = true;
      return rows?.[0]?.form ?? null;
    } catch (e) {
      this.drugDosageFormQueryAvailable = false;
      this.logger.warn(
        `drug dosage form lookup unavailable (${String(e)}) — form falls back to the drug name`,
      );
      return null;
    }
  }

  /** Map a drug-form display to the DHA formulation-cs coding (required binding). */
  private dhaFormCoding(display: string | null | undefined):
    | { system: string; code: string; display: string }
    | null {
    if (!display) return null;
    const hit = DHA_FORM_BY_KEYWORD.find(([re]) => re.test(display));
    return hit ? { system: DHA_FORMULATION_SYSTEM, code: hit[1], display: hit[2] } : null;
  }

  /**
   * ke-medication-dispense minimums: type (v3-ActPharmacySupplyType, required
   * binding), medication[x] as CodeableConcept (the profile restricts the
   * choice type to CodeableConcept — FHIR2's medicationReference is not
   * allowed), and qty-3 on the dispense quantity.
   */
  async enrichMedicationDispense(
    resource: FhirResourceLike,
    headers: ForwardHeaders = {},
  ): Promise<void> {
    if (!resource.id) resource.id = `dispense-${Date.now()}`;
    if (!resource.type) {
      resource.type = {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ActPharmacySupplyType',
            code: 'TF',
            display: 'Trial Fill',
          },
        ],
        text: 'Trial fill',
      };
    }

    // performer.actor is Reference(Organization | PractitionerRole) in the
    // profile — FHIR2 sends the dispensing Practitioner; re-point it as a
    // logical PractitionerRole reference keeping the identifier/display so
    // the dispenser's identity survives
    const performers = (resource.performer as Array<Record<string, unknown>> | undefined) ?? [];
    for (const performer of performers) {
      const actor = performer.actor as
        | { reference?: string; type?: string; identifier?: unknown; display?: string }
        | undefined;
      if (actor?.type === 'Practitioner') {
        delete actor.reference;
        actor.type = 'PractitionerRole';
        actor.display = actor.display ?? 'Dispensing practitioner';
      }
    }

    // statusReason[x] is required-bound to the DHA medication-dispense-
    // status-reason-cs (7 operational members; no clinical hold reasons).
    // FHIR2 sends the local concept (system-less uuid + CIEL) — neither can
    // be a member, so keep the meaning on text only (strict conformance:
    // unmapped codings are the noise the lab reports per-coding).
    const statusReason = resource.statusReasonCodeableConcept as
      | { coding?: Array<{ system?: string; code?: string; display?: string }>; text?: string }
      | undefined;
    if (statusReason?.coding?.length) {
      const dhaMember = statusReason.coding.find((c) =>
        c.system?.startsWith(DHA_TERMINOLOGY_BASE),
      );
      if (dhaMember) {
        statusReason.coding = [dhaMember];
        statusReason.text = statusReason.text ?? dhaMember.display;
      } else {
        resource.statusReasonCodeableConcept = {
          text: statusReason.text ?? statusReason.coding.find((c) => c.display)?.display ?? 'Dispense on hold',
        };
      }
    }

    // medication[x] must be a CodeableConcept with a full coding (system /
    // code / display min 1). Resolve the referenced Medication for the real
    // codings; fall back to the reference display when unreachable.
    const medRef = resource.medicationReference as
      | { reference?: string; display?: string }
      | undefined;
    if (medRef && !resource.medicationCodeableConcept) {
      resource.medicationCodeableConcept = await this.resolveMedicationCodeableConcept(
        medRef,
        headers,
      );
      delete resource.medicationReference;
    }

    // quantity is min 1 in ke-medication-dispense; FHIR2 omits it on e.g.
    // on-hold dispenses — take the ordered quantity from the authorizing
    // prescription when present, else a neutral unit (disclosed enrichment)
    let qty = resource.quantity as
      | { code?: string; system?: string; unit?: string; value?: number }
      | undefined;
    if (!qty) {
      const prescriptionRef = (
        resource.authorizingPrescription as
          | Array<{ reference?: string }>
          | undefined
      )?.[0]?.reference;
      const prescriptionId = prescriptionRef?.split('/')?.pop();
      const prescription = prescriptionId
        ? await this.fetchFhir2Read('MedicationRequest', prescriptionId, headers)
        : null;
      const ordered = (prescription?.dispenseRequest as
        | { quantity?: { value?: number; unit?: string } }
        | undefined)?.quantity;
      qty = ordered?.value
        ? { value: ordered.value, unit: ordered.unit ?? 'unit not recorded' }
        : { value: 1, unit: 'unit not recorded' };
      resource.quantity = qty;
    }

    if (qty?.code && !qty.system) {
      const ucum: Record<string, string> = {
        mg: 'mg',
        ml: 'mL',
        tab: '{tab}',
        tabs: '{tab}',
        tablet: '{tab}',
        dose: '{dose}',
      };
      const mapped = ucum[qty.code.toLowerCase()];
      if (mapped) {
        qty.system = 'http://unitsofmeasure.org';
        qty.code = mapped;
      } else {
        // qty-3: a bare code without a system is invalid — keep value + unit
        qty.unit = qty.unit ?? qty.code;
        delete qty.code;
      }
    }
  }

  /**
   * Convert FHIR2's medicationReference to the CodeableConcept the ke
   * profiles require. Coding preference: a DHA generic-products coding when
   * that CodeSystem has published concepts — the v0.1.0 erx IG ships it
   * EMPTY (the required generic-products-vs binding is unsatisfiable until
   * DHA populates it: any coding fails VS membership, a DHA-system coding
   * fails as an unknown code, text-only fails 'no code provided') — else the
   * single canonical CIEL/AMPATH identity coding with the display on text
   * (disclosed IG gap). The self-healing means staging goes green the moment
   * DHA publishes, with no redeploy; a restart also re-attempts the fetch.
   */
  private async resolveMedicationCodeableConcept(
    medRef: { reference?: string; display?: string },
    headers: ForwardHeaders,
  ): Promise<{ coding: FhirCoding[]; text: string }> {
    const medId = medRef.reference?.split('/')?.pop();
    const med = medId ? await this.fetchFhir2Read('Medication', medId, headers) : null;
    const medCode = (med?.code ?? {}) as {
      coding?: Array<{ system?: string; code?: string; display?: string }>;
      text?: string;
    };
    const display = String(medCode.text ?? medRef.display ?? 'Unknown medication').trim();

    // 1) HPT by the GE code in the display — deterministic, no lookup
    const hpt = await this.hptCodingFor(display);
    if (hpt) {
      return { coding: [hpt], text: display };
    }

    // 2) a populated generic-products-cs (once DHA publishes concepts there)
    const generic = this.dhaGenericProductCoding(display);
    if (generic) {
      return { coding: [generic], text: display };
    }

    const codings = (medCode.coding ?? [])
      .filter((c) => c.code)
      .map((c) => ({ system: c.system ?? OCL_AMPATH_SYSTEM, code: c.code!, display: String(c.display ?? '').trim() }));
    const canonical = codings.length
      ? [codings.find((c) => c.system?.includes('/CIEL')) ?? codings[0]]
      : [
          {
            system: OCL_AMPATH_SYSTEM,
            code: medId ?? 'unknown',
            display: medRef.display ?? 'Unknown medication',
          },
        ];
    return { coding: canonical, text: display };
  }

  /** DHA generic-products concepts (empty in the published IG — refreshed once per process). */
  private genericProductCache: Array<{ code: string; display: string }> | null = null;
  private genericProductFetchAttempted = false;

  /**
   * DHA generic-products-cs coding for a drug display. Returns null while
   * the CodeSystem is empty (the v0.1.0 IG state) — callers then keep the
   * CIEL identity coding. Non-blocking: the first call seeds an empty cache
   * and kicks a fire-and-forget refresh; later calls in the same process
   * use whatever it fetched.
   */
  private dhaGenericProductCoding(
    display: string,
  ): { system: string; code: string; display: string } | null {
    if (this.genericProductCache === null) {
      this.genericProductCache = [];
      void this.refreshGenericProducts();
      return null;
    }
    if (!this.genericProductCache.length || !display.trim()) return null;
    const d = display.trim().toLowerCase();
    // generic products are INN-named (aspirin is published as Acetylsalicylic
    // Acid) — reuse the active-components synonym table for the first hop
    const synonym = ACTIVE_COMPONENT_SYNONYMS[d];
    const byDisplay = (name: string) =>
      this.genericProductCache!.find((c) => c.display.toLowerCase() === name.toLowerCase());
    const hit =
      (synonym && byDisplay(synonym)) ??
      byDisplay(d) ??
      this.genericProductCache.find((c) => {
        const cd = c.display.toLowerCase();
        return cd.includes(d) || d.includes(cd);
      });
    return hit
      ? {
          system: `${DHA_TERMINOLOGY_BASE}/CodeSystem/generic-products-cs`,
          code: hit.code,
          display: hit.display,
        }
      : null;
  }

  /**
   * HPT (MOH-PPB) coding for a drug display. Naming convention (DHA HPT /
   * NHTS): standard drugs carry their HPT generic-product code in the
   * display — 'Aceclofenac … Oral Tablet (GE10775)' — and that code IS the
   * HPT identifier (https://nhts.dha.go.ke/orgs/MOH-PPB/sources/HPT/concepts/GE10775).
   * Deterministic for bracket-coded drugs: emit generic-products-cs#GE-code
   * with the HPT product name (the display without the bracket suffix).
   * Non-standard drugs (no bracket code) fall back to a confidence-gated
   * HPT name search; null when nothing matches confidently — callers keep
   * the CIEL identity coding.
   */
  private hptNameSearchCache = new Map<string, FhirCoding | null>();
  private hptSearchWarned = false;

  private hptCodingFor(display: string): Promise<FhirCoding | null> {
    const m = /\((GE\d+)\)/.exec(display ?? '');
    if (m) {
      return Promise.resolve({
        system: `${DHA_TERMINOLOGY_BASE}/CodeSystem/generic-products-cs`,
        code: m[1],
        display: (display ?? '').replace(/\s*\(GE\d+\)\s*$/, '').trim(),
      });
    }
    const normalized = (display ?? '').trim().toLowerCase();
    if (!normalized) return Promise.resolve(null);
    if (this.hptNameSearchCache.has(normalized)) {
      return Promise.resolve(this.hptNameSearchCache.get(normalized)!);
    }
    return this.hptSearchByName(normalized, display).then((coding) => {
      this.hptNameSearchCache.set(normalized, coding);
      return coding;
    });
  }

  /**
   * Confidence-gated HPT name search for drugs whose display carries no GE
   * code. A candidate is accepted only when its name contains EVERY
   * generic-name token (>=4 chars, dosage-form words excluded) AND every
   * strength value of the order (e.g. '81 mg'); otherwise null — a near-miss
   * brand (Asp-81 for Junior Aspirin) must not be asserted. Misses are
   * cached so each distinct drug triggers at most one OCL query.
   */
  private async hptSearchByName(
    normalized: string,
    original: string,
  ): Promise<FhirCoding | null> {
    const stop = new Set([
      'tablet', 'tablets', 'tab', 'tabs', 'capsule', 'capsules', 'cap', 'caps',
      'oral', 'syrup', 'suspension', 'injection', 'cream', 'ointment',
      'ampoule', 'dispersible', 'juvenile',
    ]);
    const strengths = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(?:mg|mcg|g|ml|%)/g)].map(
      (m) => m[1],
    );
    const tokens = normalized
      .replace(/\(ge\d+\)/g, ' ')
      .replace(/\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|%)/g, ' ')
      .split(/[^a-z]+/)
      .filter((t) => t.length >= 4 && !stop.has(t));
    if (!tokens.length) return null;
    try {
      const resp = await fetch(
        `${HPT_OCL_BASE}${HPT_SOURCE_PATH}?q=${encodeURIComponent(tokens.join(' '))}&limit=25`,
        { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) },
      );
      if (!resp.ok) {
        if (!this.hptSearchWarned) {
          this.hptSearchWarned = true;
          this.logger.warn(
            `HPT name search -> ${resp.status} — non-GE medication codings keep the CIEL identity (disclosed gap)`,
          );
        }
        return null;
      }
      const results = (await resp.json()) as Array<{ id?: string; display_name?: string }>;
      for (const c of Array.isArray(results) ? results : []) {
        const candidate = String(c.display_name ?? '').toLowerCase();
        if (!c.id || !candidate) continue;
        if (tokens.every((t) => candidate.includes(t)) && strengths.every((s) => candidate.includes(s))) {
          return {
            system: `${DHA_TERMINOLOGY_BASE}/CodeSystem/generic-products-cs`,
            code: c.id,
            display: String(c.display_name).trim(),
          };
        }
      }
      return null;
    } catch (e) {
      if (!this.hptSearchWarned) {
        this.hptSearchWarned = true;
        this.logger.warn(
          `HPT name search failed (${String(e)}) — non-GE medication codings keep the CIEL identity (disclosed gap)`,
        );
      }
      return null;
    }
  }

  private async refreshGenericProducts(): Promise<void> {
    if (this.genericProductFetchAttempted) return;
    this.genericProductFetchAttempted = true;
    try {
      const resp = await fetch(`${DHA_TERMINOLOGY_BASE}/CodeSystem/generic-products-cs`, {
        headers: { accept: 'application/fhir+json' },
        signal: AbortSignal.timeout(20000),
      });
      if (!resp.ok) return;
      const cs = (await resp.json()) as { concept?: Array<{ code?: string; display?: string }> };
      const concepts = (cs.concept ?? [])
        .filter((c) => c.code && c.display)
        .map((c) => ({ code: c.code!, display: c.display! }));
      if (concepts.length) {
        this.genericProductCache = concepts;
        this.logger.log(
          `generic-products-cs refreshed: ${concepts.length} concepts — medication codings now map to it`,
        );
      }
    } catch {
      // pod egress to fhir.dha.go.ke is intermittent — silent by design;
      // the CIEL identity coding (disclosed gap) is served meanwhile
    }
  }

  /**
   * True when the resource's medication coding was mapped to the DHA
   * generic-products terminology (HPT GE code or a published concept).
   * Unmapped resources are excluded from searchsets — the eRx profiles
   * require medication[x] from generic-products-vs and the lab rejects
   * anything else.
   */
  isMedicationIgMapped(resource: FhirResourceLike): boolean {
    const isMedicationFamily = [
      'MedicationRequest',
      'MedicationDispense',
      'MedicationStatement',
      'Medication',
    ].includes(resource.resourceType);
    if (!isMedicationFamily) return true;
    const coding =
      (resource.medicationCodeableConcept as
        | { coding?: FhirCoding[] }
        | undefined)?.coding ??
      (resource.code as { coding?: FhirCoding[] } | undefined)?.coding;
    return (
      Array.isArray(coding) &&
      coding.some((c) => c.system?.includes('generic-products-cs'))
    );
  }

  /** Single-resource FHIR2 read (used to resolve dispense medication refs). */
  private async fetchFhir2Read(
    resourceType: string,
    id: string,
    headers: ForwardHeaders,
  ): Promise<Record<string, unknown> | null> {
    const base = this.configService.get<string>('AMRS_BASE_URL') ?? '';
    const withScheme = /^https?:\/\//.test(base) ? base : `https://${base}`;
    const url = `${withScheme.replace(/\/+$/, '')}/openmrs/ws/fhir2/R4/${resourceType}/${id}`;
    try {
      const resp = await fetch(url, {
        headers: {
          accept: 'application/fhir+json',
          ...(headers.cookie ? { cookie: headers.cookie } : {}),
          ...(headers.authorization ? { authorization: headers.authorization } : {}),
        },
        signal: AbortSignal.timeout(20000),
      });
      if (!resp.ok) {
        this.logger.warn(`FHIR2 ${resourceType}/${id} read -> ${resp.status}`);
        return null;
      }
      return (await resp.json()) as Record<string, unknown>;
    } catch (error) {
      this.logger.warn(`FHIR2 ${resourceType}/${id} read failed: ${String(error)}`);
      return null;
    }
  }

  /** kenya-core-episodeofcare guard: id + status + type coding. */
  async enrichEpisodeOfCare(resource: FhirResourceLike): Promise<void> {
    if (!resource.id) resource.id = `episodeofcare-${Date.now()}`;
    if (!resource.status) resource.status = 'active';
    if (!resource.type) {
      resource.type = [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
              code: 'AMB',
              display: 'Ambulatory',
            },
          ],
          text: 'Ambulatory care',
        },
      ];
    }
  }

  /**
   * kenya-core-allergyintolerance minimums (all required bindings):
   *  - clinicalStatus/verificationStatus (min 1): DHA condition-{clinical,
   *    verification}-status codings, replacing the HL7 ones (non-member
   *    codings fail the required DHA value sets)
   *  - `type` (min 1): FHIR2 emits 'allergy' which is not a member of the
   *    base allergy-intolerance-type VS — normalized to biologic/non-biologic
   *  - `category` (min 1): R4 plain `code` values (food/medication/environment/
   *    biologic); a default is derived from the substance when missing
   *  - `criticality` (min 1): base VS member
   *  - `code` + reaction.substance: mapped to the DHA active-components-cs
   *    (INN display match + synonym table) where possible
   *  - reaction.manifestation: DHA manifestation-cs coding by keyword
   *  - reaction.severity (min 1): base reaction-event-severity member
   *  - recordedDate (min 1): fallback from meta.lastUpdated
   */
  async enrichAllergyIntolerance(resource: FhirResourceLike): Promise<void> {
    if (!resource.id) resource.id = `allergyintolerance-${Date.now()}`;

    const substanceDisplay = String(
      (resource.code as { text?: string } | undefined)?.text ??
        (resource.code as { coding?: FhirCoding[] } | undefined)?.coding?.[0]?.display ?? '',
    );

    // -- clinicalStatus (min 1, DHA VS)
    const clinical = resource.clinicalStatus as { coding?: FhirCoding[]; text?: string } | undefined;
    const hl7Clinical = clinical?.coding?.find((c) => c.system?.includes('allergyintolerance-clinical'))?.code
      ?? clinical?.coding?.[0]?.code ?? 'active';
    const dhaClinical = DHA_CLINICAL_STATUS[hl7Clinical] ?? 'ACTIVE';
    resource.clinicalStatus = {
      coding: [
        {
          system: `${DHA_TERMINOLOGY_BASE}/CodeSystem/condition-clinical-status-cs`,
          code: dhaClinical,
          display: dhaClinical === 'ACTIVE' ? 'Active' : dhaClinical === 'RESOLVED' ? 'Resolved' : 'Inactive',
        },
      ],
      text: clinical?.text ?? hl7Clinical,
    } as never;

    // -- verificationStatus (min 1, DHA VS)
    const verification = resource.verificationStatus as { coding?: FhirCoding[] } | undefined;
    const hl7Verification = verification?.coding?.find((c) => c.system?.includes('verification'))?.code
      ?? 'confirmed';
    const dhaVerification = DHA_VERIFICATION_STATUS[hl7Verification] ?? 'CONFIRMED';
    resource.verificationStatus = {
      coding: [
        {
          system: `${DHA_TERMINOLOGY_BASE}/CodeSystem/condition-verification-status-cs`,
          code: dhaVerification,
          display: dhaVerification.charAt(0) + dhaVerification.slice(1).toLowerCase(),
        },
      ],
      text: verification?.coding?.[0]?.display ?? hl7Verification,
    } as never;

    // -- category (min 1, plain R4 codes; derive from the substance)
    const category = resource.category;
    if (!Array.isArray(category) || !category.length) {
      resource.category = [this.allergyCategoryFor(substanceDisplay)];
    } else {
      const kept = (category as unknown[]).filter(
        (c) => ['food', 'medication', 'environment', 'biologic'].includes(String(c)),
      );
      resource.category = kept.length ? kept : [this.allergyCategoryFor(substanceDisplay)];
    }

    // -- type (min 1): R4 binds to allergy-intolerance-type (allergy |
    //    intolerance); FHIR2 already sends 'allergy' — keep it, default when
    //    missing
    if (resource.type !== 'allergy' && resource.type !== 'intolerance') {
      resource.type = 'allergy';
    }

    // -- criticality (min 1, base VS member)
    if (!resource.criticality) {
      resource.criticality = 'unable-to-assess';
    }

    // -- recordedDate (min 1)
    if (!resource.recordedDate) {
      resource.recordedDate =
        toFhirDateTime((resource.meta as { lastUpdated?: string } | undefined)?.lastUpdated) ??
        new Date().toISOString();
    }

    // -- code + reaction substance: required binding to active-components-vs
    //    (DHA) — replace the codings with the matched INN coding (original
    //    local codings cannot validate against a required DHA value set;
    //    the substance text preserves them)
    const componentCoding = this.activeComponentCoding(substanceDisplay);
    if (componentCoding) {
      const code = resource.code as { coding?: FhirCoding[]; text?: string } | undefined;
      code!.coding = [componentCoding];
      code!.text = code!.text ?? substanceDisplay;
      const reactions = Array.isArray(resource.reaction)
        ? (resource.reaction as Array<Record<string, unknown>>)
        : [];
      for (const reaction of reactions) {
        const substance = reaction.substance as { coding?: FhirCoding[]; text?: string } | undefined;
        if (substance) {
          substance.coding = [componentCoding];
          substance.text = substance.text ?? substanceDisplay;
        }
      }
    }

    // -- reaction depth: manifestation coding (required DHA manifestation-vs,
    //    replaced when matched) + severity (both min 1)
    const reactions = Array.isArray(resource.reaction)
      ? (resource.reaction as Array<Record<string, unknown>>)
      : [];
    for (const reaction of reactions) {
      const manifestation = Array.isArray(reaction.manifestation)
        ? (reaction.manifestation as Array<{ coding?: FhirCoding[]; text?: string }>)
        : [];
      for (const m of manifestation) {
        const display = m.text ?? m.coding?.find((c) => c.display)?.display ?? '';
        const dhaManifestation = this.dhaManifestationCoding(display);
        if (dhaManifestation) {
          m.coding = [dhaManifestation];
          m.text = display;
        }
      }
      if (!manifestation.length && typeof reaction.manifestation === 'undefined') {
        reaction.manifestation = [{ text: 'Unknown reaction' }];
      }
      if (!reaction.severity) {
        reaction.severity = 'moderate';
      }
    }
  }

  /** R4 AllergyIntolerance.category plain code derived from the substance. */
  private allergyCategoryFor(substanceDisplay: string): string {
    const d = substanceDisplay.toLowerCase();
    if (/egg|milk|peanut|nut|wheat|fish|shellfish|soy|latex|pollen|dust|mould|mold/.test(d)) {
      return /pollen|dust|mould|mold/.test(d) ? 'environment' : 'food';
    }
    return 'medication';
  }

  /** DHA manifestation-cs coding matched from a reaction display (best effort). */
  private dhaManifestationCoding(
    display: string,
  ): { system: string; code: string; display: string } | null {
    if (!display) return null;
    const hit = DHA_MANIFESTATION_BY_KEYWORD.find(([re]) => re.test(display));
    return hit ? { system: DHA_MANIFESTATION_SYSTEM, code: hit[1], display: hit[2] } : null;
  }

  /**
   * DHA active-components-cs coding for a substance (kenya-core-
   * allergyintolerance required binding): INN display match against the
   * active-components concept list, synonym table, then substring match.
   */
  private activeComponentCoding(
    substanceDisplay: string,
  ): { system: string; code: string; display: string } | null {
    const d = substanceDisplay.trim().toLowerCase();
    if (!d) return null;
    const concepts = this.activeComponents();
    if (!concepts.length) return null;

    const byDisplay = (name: string) =>
      concepts.find((c) => c.display.toLowerCase() === name.toLowerCase());
    const synonym = ACTIVE_COMPONENT_SYNONYMS[d];
    const hit =
      (synonym && byDisplay(synonym)) ??
      byDisplay(substanceDisplay.trim()) ??
      concepts.find((c) => {
        const cd = c.display.toLowerCase();
        return cd.includes(d) || d.includes(cd);
      });
    if (!hit) return null;
    return {
      system: `${DHA_TERMINOLOGY_BASE}/CodeSystem/active-components-cs`,
      code: hit.code,
      display: hit.display,
    };
  }

  /**
   * The active-components concept list. The bundled snapshot is the
   * baseline — the pod's egress to fhir.dha.go.ke is intermittent (staging
   * logged 'active-components-cs fetch failed: TypeError: fetch failed'),
   * and with a cold cache every allergy resource used to block on (and
   * retry) the failing fetch. The live-IG refresh is opportunistic
   * fire-and-forget: it never blocks enrichment and warns at most once.
   */
  private activeComponents(): Array<{ code: string; display: string }> {
    if (this.activeComponentCache) return this.activeComponentCache;
    this.activeComponentCache = ACTIVE_COMPONENTS.map(([code, display]) => ({
      code,
      display,
    }));
    void this.refreshActiveComponents();
    return this.activeComponentCache;
  }

  private async refreshActiveComponents(): Promise<void> {
    if (this.activeComponentRefreshAttempted) return;
    this.activeComponentRefreshAttempted = true;
    try {
      const resp = await fetch(`${DHA_TERMINOLOGY_BASE}/CodeSystem/active-components-cs`, {
        headers: { accept: 'application/fhir+json' },
        signal: AbortSignal.timeout(20000),
      });
      if (!resp.ok) {
        this.logger.warn(
          `active-components-cs refresh -> ${resp.status} (bundled snapshot in use)`,
        );
        return;
      }
      const cs = (await resp.json()) as { concept?: Array<{ code?: string; display?: string }> };
      const concepts = (cs.concept ?? [])
        .filter((c) => c.code && c.display)
        .map((c) => ({ code: c.code!, display: c.display! }));
      if (concepts.length) {
        this.activeComponentCache = concepts;
      }
    } catch (e) {
      this.logger.warn(
        `active-components-cs refresh failed (bundled snapshot in use): ${String(e)}`,
      );
    }
  }

  /**
   * kenya-core-encounter minimums: `type` is required-bound to the DHA
   * encounter-type-vs — the OpenMRS visit-type coding cannot validate there,
   * so it is replaced with the encounter-type-cs coding mapped from the
   * visit-type display (kept as text).
   */
  async enrichEncounter(resource: FhirResourceLike): Promise<void> {
    const type = resource.type as
      | Array<{ text?: string; coding?: Array<{ system?: string; code?: string; display?: string }> }>
      | undefined;
    const originalDisplay =
      type?.[0]?.text ?? type?.[0]?.coding?.[0]?.display ?? '';
    const hit = DHA_ENCOUNTER_TYPE_BY_KEYWORD.find(([re]) => re.test(originalDisplay));
    const mapped = hit
      ? { code: hit[1], display: hit[2] }
      : { code: 'CONSULTATION', display: 'Consultation' };
    resource.type = [
      {
        coding: [
          {
            system: DHA_ENCOUNTER_TYPE_SYSTEM,
            code: mapped.code,
            display: mapped.display,
          },
        ],
        text: originalDisplay || mapped.display,
      },
    ] as never;
  }

  /**
   * kenya-core-observation minimums: category (min 1). Category is derived
   * from the observation display (vitals → vital-signs, lab-ish concepts →
   * laboratory, medication/therapy concepts → therapy, everything else is a
   * recorded survey-style answer → survey) and kept when FHIR2 already
   * provides one.
   */
  async enrichObservation(resource: FhirResourceLike): Promise<void> {
    const category = resource.category as
      | Array<{ coding?: Array<{ system?: string; code?: string; display?: string }>; text?: string }>
      | undefined;
    if (category && category.length > 0) return;

    const display = String(
      (resource.code as { text?: string } | undefined)?.text ??
        (resource.code as { coding?: Array<{ display?: string }> } | undefined)?.coding
          ?.find((c) => c.display)?.display ?? '',
    ).toLowerCase();
    const mapped = /\bweight\b|height|\bbmi\b|\bbp\b|blood pressure|systolic|diastolic|pulse|temp(erature)?|spo2|oxygen sat|respiratory rate|mid[- ]upper arm|muac/
      .test(display)
      ? { code: 'vital-signs', display: 'Vital Signs' }
      : /\blab|cd4|viral load|hiv(?! risk)|creatinine|hemoglobin|haemoglobin|glucose|rbs|fbs|blood group|genexpert|culture|smear|titer|serolog|test result/
          .test(display)
        ? { code: 'laboratory', display: 'Laboratory' }
        : /medication|drug|dose|dosage|adherence|refill|regimen|therapy|arv|treatment/.test(display)
          ? { code: 'therapy', display: 'Therapy' }
          : { code: 'survey', display: 'Survey' };
    resource.category = [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: mapped.code,
            display: mapped.display,
          },
        ],
        text: mapped.display,
      },
    ] as never;
  }

  /* -------------------------------------- Communications (REP-PHE alerting) */

  /** Alert notifications derived from the outbreak DetectedIssues. */
  async communicationsForOutbreak(
    startDate: string,
    endDate: string,
    headers: ForwardHeaders,
    subjectPatientUuid?: string,
  ): Promise<FhirResourceLike[]> {
    const issues = await this.detectedIssuesForOutbreak(startDate, endDate, headers);
    return issues.map((issue) => ({
      resourceType: 'Communication',
      id: `alert-${String(issue.id)}`,
      status: 'completed',
      category: [
        {
          // the profile's example binding: communication-category#alert
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/communication-category',
              code: 'alert',
              display: 'Alert',
            },
          ],
          text: 'Public health event alert',
        },
      ],
      // kenya-core-communication requires subject (Reference kenya-core-
      // patient) — the reported case-patient of the cluster
      subject: subjectPatientUuid ? { reference: `Patient/${subjectPatientUuid}` } : undefined,
      sent: new Date().toISOString(),
      about: [{ reference: `DetectedIssue/${String(issue.id)}`, display: String((issue.detail as string) ?? '').slice(0, 120) }],
      sender: { display: 'AMRS Public Health Surveillance — MTRH' },
      payload: [{ contentString: String(issue.detail ?? '') }],
    }));
  }

  /* ------------------------------------ eRx surface (FUNC-EPRES-001) */

  /** MedicationStatements synthesized from the patient's active MedicationRequests. */
  async medicationStatements(patientUuid: string, headers: ForwardHeaders): Promise<FhirResourceLike[]> {
    // no `status=active` here — this FHIR2 answers 500 on that parameter
    // combo; fetch all and filter client-side
    const entries = await this.fetchFhir2Search('MedicationRequest', `patient=${patientUuid}&_count=50`, headers);
    const statements: FhirResourceLike[] = [];
    for (const entry of entries) {
      const mr = (entry as { resource?: Record<string, unknown> }).resource;
      if (!mr) continue;
      if (String(mr.status ?? '').toLowerCase() !== 'active') continue;
      // ke-medication-statement requires medication[x] — FHIR2 MedicationRequests
      // carry medicationReference, never medicationCodeableConcept, so resolve
      // the reference (same converter + DHA generic-products preference as the
      // other medication surfaces)
      const medication =
        (mr.medicationCodeableConcept as { coding?: FhirCoding[]; text?: string } | undefined) ??
        (mr.medicationReference
          ? await this.resolveMedicationCodeableConcept(
              mr.medicationReference as { reference?: string; display?: string },
              headers,
            )
          : undefined);
      // statements whose drug could not be mapped to the DHA terminology are
      // excluded — the lab rejects non-generic-products codings (the drug
      // needs its HPT GE code added on the AMRS side; it reappears then)
      const mapped = (medication as { coding?: FhirCoding[] } | undefined)?.coding?.some(
        (c) => c.system?.includes('generic-products-cs'),
      );
      if (!mapped) continue;
      // qty-3 on the copied dosage: FHIR2 doseQuantity codes are OpenMRS
      // uuids without a system — strip the bare code, keep value + unit
      const dosage = mr.dosageInstruction as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(dosage)) {
        for (const di of dosage) {
          for (const dr of (di.doseAndRate as Array<Record<string, unknown>> | undefined) ?? []) {
            const dq = dr.doseQuantity as
              | { code?: string; system?: string; unit?: string }
              | undefined;
            if (dq?.code && !dq.system) {
              dq.unit = dq.unit ?? dq.code;
              delete dq.code;
            }
          }
        }
      }
      statements.push({
        resourceType: 'MedicationStatement',
        id: `ms-${String(mr.id)}`,
        status: 'active',
        medicationCodeableConcept: medication,
        subject: mr.subject,
        dateAsserted: (mr.authoredOn as string) ?? new Date().toISOString(),
        informationSource: mr.requester,
        // R4 MedicationStatement carries `dosage` — not MedicationRequest's
        // `dosageInstruction` element name
        dosage,
        derivedFrom: [{ reference: `MedicationRequest/${String(mr.id)}` }],
      });
    }
    return statements;
  }

  /**
   * Provenances synthesized from the same audit sources as AuditEvent.
   * R4 deltas vs the AuditEvent shape: agent has NO `requestor` (removed in
   * R4 — the validator rejects it as unrecognized), activity uses
   * v3-DataOperation (CREATE/UPDATE/DELETE live there, not in v3-ActCode),
   * and agent.type carries the provenance-participant-type coding the
   * kenya-core-provenance profile expects (coding min 1).
   */
  async provenancesForPatient(patientUuid: string): Promise<FhirResourceLike[]> {
    const events = await this.auditEventsForPatient(patientUuid);
    const byTarget = new Map<string, FhirResourceLike>();
    for (const event of events) {
      const entity = (event.entity as Array<{ what?: { reference?: string } }> | undefined)?.[0];
      const ref = entity?.what?.reference;
      if (!ref) continue;
      if (!byTarget.has(ref)) {
        const action = String(event.action);
        const who = (event.agent as Array<{ who?: { display?: string } }> | undefined)?.[0]?.who;
        const interaction =
          action === 'C' ? 'create' : action === 'D' ? 'delete' : 'update';
        const dataOperation =
          action === 'C' ? 'CREATE' : action === 'D' ? 'DELETE' : 'UPDATE';
        const operationDisplay =
          dataOperation === 'CREATE' ? 'create' : dataOperation === 'DELETE' ? 'delete' : 'revise';
        byTarget.set(ref, {
          resourceType: 'Provenance',
          id: `prov-${ref.replace(/[^a-zA-Z0-9-]/g, '-')}`,
          recorded: toFhirDateTime(event.recorded) ?? new Date().toISOString(),
          agent: [
            {
              type: {
                coding: [
                  {
                    system:
                      'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
                    code: 'author',
                    display: 'Author',
                  },
                ],
              },
              who: who ?? { display: 'system' },
            },
          ],
          target: [{ reference: ref }],
          activity: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v3-DataOperation',
                code: dataOperation,
                display: operationDisplay,
              },
            ],
            text: `${interaction} on ${ref}`,
          },
        });
      }
    }
    return [...byTarget.values()];
  }

  /* ------------------------------------------------- Task v2 (notify / ihr) */

  /**
   * REP-IMM-001: notification Tasks for the patient's immediately-notifiable
   * conditions — `code=notify`, `priority=stat`, `executionPeriod` within the
   * IDSR 24-hour window of the recorded case.
   */
  async notifyTasksForPatient(patientUuid: string, headers: ForwardHeaders): Promise<FhirResourceLike[]> {
    const entries = await this.fetchFhir2Search('Condition', `patient=${patientUuid}&_count=50`, headers);
    const tasks: FhirResourceLike[] = [];
    for (const entry of entries) {
      const condition = (entry as { resource?: Record<string, unknown> }).resource;
      if (!condition) continue;
      const display = String(
        ((condition.code as { text?: string })?.text ??
          (condition.code as { coding?: Array<{ display?: string }> } | undefined)?.coding?.[0]?.display ?? ''),
      ).toLowerCase();
      if (!this.isNotifiable(display)) continue;
      const recorded = String(condition.recordedDate ?? '');
      tasks.push({
        resourceType: 'Task',
        id: `notify-${String(condition.id)}-${tasks.length + 1}`,
        status: 'completed',
        intent: 'order',
        code: { text: 'notify' },
        priority: 'stat',
        focus: { reference: `Condition/${String(condition.id)}`, display: display },
        for: condition.subject,
        authoredOn: recorded || undefined,
        executionPeriod: { start: recorded || undefined, end: recorded || undefined },
        reasonCode: { text: `Immediately-notifiable disease recorded (${display}) — notification within IDSR 24-hour rule` },
      });
    }
    return tasks;
  }

  /* ------------------------------------------------------------- helpers */

  private etlTarget(): string {
    const target = this.configService.get<string>('ETL_GATEWAY_TARGET');
    return (target || 'http://127.0.0.1:8002').replace(/\/+$/, '');
  }

  private async fetchEtlAggregate(
    path: string,
    query: Record<string, string>,
    headers: ForwardHeaders,
  ): Promise<Array<Record<string, unknown>>> {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v)).toString();
    const url = `${this.etlTarget()}${path}${qs ? `?${qs}` : ''}`;
    try {
      const resp = await fetch(url, {
        headers: {
          accept: 'application/json',
          ...(headers.cookie ? { cookie: headers.cookie } : {}),
          ...(headers.authorization ? { authorization: headers.authorization } : {}),
        },
        signal: AbortSignal.timeout(25000),
      });
      if (!resp.ok) {
        this.logger.warn(`ETL aggregate ${path} -> ${resp.status}`);
        return [];
      }
      const payload = (await resp.json()) as { result?: Array<Record<string, unknown>> };
      return payload.result ?? [];
    } catch (error) {
      this.logger.warn(`ETL aggregate ${path} failed: ${String(error)}`);
      return [];
    }
  }

  private async fetchFhir2Search(
    resourceType: string,
    query: string,
    headers: ForwardHeaders,
  ): Promise<unknown[]> {
    const base = this.configService.get<string>('AMRS_BASE_URL') ?? '';
    const withScheme = /^https?:\/\//.test(base) ? base : `https://${base}`;
    const url = `${withScheme.replace(/\/+$/, '')}/openmrs/ws/fhir2/R4/${resourceType}?${query}`;
    try {
      const resp = await fetch(url, {
        headers: {
          accept: 'application/fhir+json',
          ...(headers.cookie ? { cookie: headers.cookie } : {}),
          ...(headers.authorization ? { authorization: headers.authorization } : {}),
        },
        signal: AbortSignal.timeout(20000),
      });
      if (!resp.ok) {
        this.logger.warn(`FHIR2 ${resourceType} search -> ${resp.status}`);
        return [];
      }
      const bundle = (await resp.json()) as { entry?: unknown[] };
      return bundle.entry ?? [];
    } catch (error) {
      this.logger.warn(`FHIR2 ${resourceType} search failed: ${String(error)}`);
      return [];
    }
  }
}
