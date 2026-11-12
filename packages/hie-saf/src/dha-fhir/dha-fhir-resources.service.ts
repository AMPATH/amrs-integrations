import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AMRS_CONNECTION } from '../core/database/db.module';
import { CaseSummaryService } from '../case-summary/case-summary.service';
import { EmtService } from '../emt/emt.service';
import { ListEmtReferralsDto } from '../emt/dto/list-emt-referrals.dto';

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

/** Live Kenya Core IG base (ke.fhir.core v1.0.0 — verified fetchable). */
const DHA_IG_BASE = 'https://fhir.dha.go.ke/core';

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
  async composition(patientUuid: string, locationUuid: string): Promise<FhirResourceLike> {
    const dto = { patientUuid, locationUuid } as Parameters<
      CaseSummaryService['getVisitCaseSummary']
    >[0];
    const summary = (await this.caseSummaryService.getVisitCaseSummary(dto)) as CaseSummaryLike;

    const sections: Array<{ title: string; code: string; text: string }> = [];
    sections.push(this.conditionsSection(summary.conditions ?? []));
    sections.push(this.allergiesSection(summary.allergies ?? []));
    sections.push(this.vitalsSection(summary.vitals ?? {}));
    sections.push(this.medicationsSection(summary.medications ?? []));
    sections.push(this.soapSection(summary.soapNote ?? {}));
    sections.push(this.labsSection(summary.labOrders ?? []));

    const demographics = summary.demographics ?? {};

    return {
      resourceType: 'Composition',
      id: `summary-${patientUuid}`,
      meta: { source: 'hie-saf/case-summary' },
      status: 'final',
      type: {
        coding: [
          {
            system: 'http://loinc.org',
            code: '11506-3',
            display: 'Patient summary',
          },
        ],
      },
      subject: {
        reference: `Patient/${patientUuid}`,
        display: demographics.name,
      },
      date: summary.visit?.startDatetime ?? new Date().toISOString(),
      title: `Clinical summary — ${demographics.name ?? patientUuid}`,
      section: sections.map((s) => ({
        title: s.title,
        code: { coding: [{ system: 'http://loinc.org', code: s.code }] },
        text: { status: 'generated', div: `<div xmlns="${XHTML_NS}">${s.text}</div>` },
      })),
    };
  }

  private conditionsSection(conditions: NonNullable<CaseSummaryLike['conditions']>): { title: string; code: string; text: string } {
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
      text:
        `<table><thead><tr><th>ICD-11 code</th><th>Description</th><th>Certainty</th>` +
        `<th>Primary</th><th>Onset</th></tr></thead><tbody>${rows}</tbody></table>`,
    };
  }

  private allergiesSection(allergies: NonNullable<CaseSummaryLike['allergies']>): { title: string; code: string; text: string } {
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
      text: `<table><thead><tr><th>Substance</th><th>Criticality</th><th>Reaction</th></tr></thead><tbody>${rows}</tbody></table>`,
    };
  }

  private vitalsSection(vitals: Record<string, string>): { title: string; code: string; text: string } {
    const entries = Object.entries(vitals);
    const rows = entries.length
      ? entries.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')
      : `<tr><td colspan="2">No vital signs recorded for this visit.</td></tr>`;
    return {
      title: 'Vital signs',
      code: '8716-0',
      text: `<table><thead><tr><th>Sign</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table>`,
    };
  }

  private medicationsSection(meds: NonNullable<CaseSummaryLike['medications']>): { title: string; code: string; text: string } {
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
      text: `<table><thead><tr><th>Date</th><th>Drug</th><th>Duration</th><th>Instructions</th></tr></thead><tbody>${rows}</tbody></table>`,
    };
  }

  private soapSection(soap: NonNullable<CaseSummaryLike['soapNote']>): { title: string; code: string; text: string } {
    return {
      title: 'Clinical notes',
      code: '34109-9',
      text: `<p><strong>Assessment:</strong> ${esc(soap.assessment ?? 'Not recorded.')}</p>` +
        `<p><strong>Plan:</strong> ${esc(soap.plan ?? 'Not recorded.')}</p>`,
    };
  }

  private labsSection(labs: NonNullable<CaseSummaryLike['labOrders']>): { title: string; code: string; text: string } {
    return {
      title: 'Laboratory',
      code: '19396-6',
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
        code: { text: 'allergy-drug-interaction' },
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
          code: { text: 'public-health-event-cluster' },
          severity: 'substantial',
          identifiedPeriod: { start: startDate, end: endDate },
          detail: `${count} case(s) of ${disease.replace(/_/g, ' ')} recorded between ${startDate} and ${endDate} — exceeds single-case expectation for an immediately-notifiable disease; public-health alert workflow applies.`,
          evidence: [
            { display: `MOH 705A aggregate (${disease.replace(/_/g, ' ')} = ${count})` },
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
      events.push({
        resourceType: 'AuditEvent',
        id: `audit-${kind.toLowerCase()}-${resourceUuid}-${action}-${events.length + 1}`,
        type: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
              code: 'rest',
              display: 'RESTful Operation',
            },
          ],
        },
        subtype: [
          {
            coding: [
              {
                system: 'http://hl7.org/fhir/restful-interaction',
                code: interaction,
                display: interaction,
              },
            ],
          },
        ],
        action,
        recorded: when,
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
      pushEvent(uuid, 'Encounter', 'C', safe(e.date_created) ?? '', safe(e.creator) ?? 'system');
      if (safe(e.date_changed) && safe(e.changer)) {
        pushEvent(uuid, 'Encounter', 'U', safe(e.date_changed)!, safe(e.changer)!);
      }
      if (Number(e.voided ?? 0)) {
        pushEvent(uuid, 'Encounter', 'D', safe(e.date_voided) ?? safe(e.date_created) ?? '', safe(e.voider) ?? 'system');
      }
    }
    for (const o of obs as Array<Record<string, unknown>>) {
      const uuid = String(o.resourceUuid);
      pushEvent(uuid, 'Observation', 'C', safe(o.date_created) ?? '', safe(o.creator) ?? 'system');
      // An obs edit mints a new row pointing at its previous version — the
      // new row's date_created/creator is the edit event.
      if (o.previous_version != null) {
        pushEvent(uuid, 'Observation', 'U', safe(o.date_created) ?? '', safe(o.creator) ?? 'system');
      }
      if (Number(o.voided ?? 0)) {
        pushEvent(uuid, 'Observation', 'D', safe(o.date_voided) ?? safe(o.date_created) ?? '', safe(o.voider) ?? 'system');
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
          code: { text: 'IHR-reportable-event-escalation' },
          authoredOn: new Date().toISOString(),
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
      identifier: [{ system: 'https://fhir.dha.go.ke/core/NamingSystem/emt-submission', value: String(r.submission_id ?? '') }],
      status: String(r.status) === 'pending_acceptance' ? 'requested' : 'completed',
      intent: 'order',
      code: { text: 'ambulance-referral' },
      focus: { display: `EMT case ${String(r.case_number ?? '')} (incident ${String(r.incident_id ?? '')})` },
      authoredOn: r.created_at ? String(r.created_at) : undefined,
      reasonCode: { text: 'Cross-facility ambulance handover pending acceptance' },
    }));
  }

  /* ------------------------------------------------- Condition ICD-11 enrichment */

  /**
   * INTER-SEM-001: FHIR2 Conditions carry only the local concept UUID —
   * inject the ICD-11 coding from the same concept_reference_map join the
   * case-summary uses (verified live: GB60.0 / 1F40.Z / 5A22.Z / 5A13).
   */
  async enrichConditionIcd11(resource: FhirResourceLike): Promise<void> {
    const code = resource.code as { coding?: FhirCoding[]; text?: string } | undefined;
    const localCoding = code?.coding?.find((c) => c.code && !c.system) ?? code?.coding?.[0];
    const conceptUuid = localCoding?.code;
    if (!conceptUuid) return;

    const icd11 = await this.icd11ForConcept(conceptUuid);
    if (!icd11) return;

    resource.code = resource.code ?? {};
    resource.code = {
      ...(resource.code as object),
      coding: [
        ...(code?.coding ?? []),
        { system: ICD11_SYSTEM, code: icd11 },
      ],
    } as never;
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
