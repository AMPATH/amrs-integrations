import {
  All,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { BasicAuthGuard } from '../auth/guards/basic-auth-guard/basic-auth.guard';
import { DhaFhirResourcesService } from './dha-fhir-resources.service';
import type { FhirResourceLike } from './dha-fhir-resources.service';

interface GatewayRequest extends Request {
  dhaEtlCookie?: string;
  dhaEtlUser?: string;
}

interface ForwardHeaders {
  cookie?: string;
  authorization?: string;
}

interface FhirMeta {
  profile?: string[];
  [key: string]: unknown;
}

interface FhirResource {
  resourceType: string;
  meta?: FhirMeta;
  entry?: { resource?: FhirResource }[];
  [key: string]: unknown;
}

/** Known FHIR2 resource types (from the HAPI-0302 server list) — used by the comma safety net. */
const FHIR_RESOURCE_TYPES = new Set([
  'Condition', 'Group', 'MedicationRequest', 'Task', 'Immunization', 'Invoice',
  'MedicationDispense', 'DiagnosticReport', 'Patient', 'Flag', 'RelatedPerson',
  'ServiceRequest', 'Practitioner', 'AllergyIntolerance', 'EpisodeOfCare',
  'Observation', 'Medication', 'Encounter', 'Person', 'ValueSet',
  'OperationDefinition', 'Location',
]);

/**
 * Kenya Core IG (ke.fhir.core v1.0.0) — live and publicly resolvable at
 * https://fhir.dha.go.ke/core (ImplementationGuide + 31 StructureDefinitions
 * enumerated 12 Nov 2026). Canonical format:
 *   https://fhir.dha.go.ke/core/StructureDefinition/<name>
 *
 * DISCREPANCY FLAG: the round-1 feedback (NC-3) quoted a Patient profile at
 * http://hl7.dha.go.ke/ig/core/... — that host is NXDOMAIN. Patient is
 * stamped with BOTH the live canonical and the NC-3 string until DHA
 * confirms which one their validator expects.
 *
 * Types NOT covered by the IG (cannot be profiled): MedicationRequest,
 * Composition, AuditEvent, Immunization, Medication, ValueSet — flagged to
 * DHA; those resources pass through unstamped.
 */
const CANONICAL_BASE = 'https://fhir.dha.go.ke/core/StructureDefinition';
const LEGACY_PATIENT_PROFILE =
  'http://hl7.dha.go.ke/ig/core/StructureDefinition/kenya-core-patient/0.1.0';

const CONFIRMED_PROFILES: Record<string, string[]> = {
  Patient: [`${CANONICAL_BASE}/kenya-core-patient`, LEGACY_PATIENT_PROFILE],
  Encounter: [`${CANONICAL_BASE}/kenya-core-encounter`],
  Observation: [`${CANONICAL_BASE}/kenya-core-observation`],
  Condition: [`${CANONICAL_BASE}/kenya-core-condition`],
  AllergyIntolerance: [`${CANONICAL_BASE}/kenya-core-allergyintolerance`],
  ServiceRequest: [`${CANONICAL_BASE}/kenya-core-servicerequest`],
  DetectedIssue: [`${CANONICAL_BASE}/kenya-core-detectedissue`],
  MeasureReport: [`${CANONICAL_BASE}/kenya-core-measurereport`],
  Task: [`${CANONICAL_BASE}/kenya-core-task`],
  DiagnosticReport: [`${CANONICAL_BASE}/kenya-core-diagnosticreport`],
  Consent: [`${CANONICAL_BASE}/kenya-core-consent`],
  Provenance: [`${CANONICAL_BASE}/kenya-core-provenance`],
  Location: [`${CANONICAL_BASE}/kenya-core-location`],
  EpisodeOfCare: [`${CANONICAL_BASE}/kenya-core-episodeofcare`],
  Procedure: [`${CANONICAL_BASE}/kenya-core-procedure`],
  PractitionerRole: [`${CANONICAL_BASE}/kenya-core-practitionerrole`],
  RelatedPerson: [`${CANONICAL_BASE}/kenya-core-relatedperson`],
  Communication: [`${CANONICAL_BASE}/kenya-core-communication`],
  CommunicationRequest: [`${CANONICAL_BASE}/kenya-core-communicationrequest`],
  Device: [`${CANONICAL_BASE}/kenya-core-device`],
  DocumentReference: [`${CANONICAL_BASE}/kenya-core-documentreference`],
  QuestionnaireResponse: [
    `${CANONICAL_BASE}/kenya-core-questionnaireresponse`,
  ],
  Organization: [`${CANONICAL_BASE}/kenya-core-organization`],
};

/**
 * DHA FHIR facade: an authorized, Kenya-Core-stamping proxy in front of the
 * OpenMRS FHIR2 endpoint. Round-1 NC-1/NC-3 rejected plain FHIR2 resources
 * without meta.profile — this controller adds the confirmed profile to every
 * returned resource (single resource, Bundle, or searchset entries) and
 * passes everything else through unchanged.
 *
 *   GET /dha-fhir/Patient/{id}
 *   GET /dha-fhir/Condition?patient={uuid}&category=problem-list-item
 *   GET /dha-fhir/metadata            (passthrough — CapabilityStatement)
 *
 * Same authorization model as the ETL gateway: Basic validated against
 * OpenMRS by BasicAuthGuard; the caller's session cookie is forwarded to
 * FHIR2 alongside the original Authorization header.
 */
@Controller('dha-fhir')
@UseGuards(BasicAuthGuard)
export class DhaFhirController {
  private readonly logger = new Logger(DhaFhirController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly resources: DhaFhirResourcesService,
  ) {}

  private fhir2Base(): string {
    const base = this.configService.get<string>('AMRS_BASE_URL') ?? '';
    const withScheme = /^https?:\/\//.test(base) ? base : `https://${base}`;
    return `${withScheme.replace(/\/+$/, '')}/openmrs/ws/fhir2/R4`;
  }

  private profiles(): Record<string, string[]> {
    let extra: Record<string, string[]> = {};
    const raw = this.configService.get<string>('DHA_PROFILE_MAP');
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Record<string, string | string[]>;
        extra = Object.fromEntries(
          Object.entries(parsed).map(([type, url]) => [
            type,
            Array.isArray(url) ? url : [url],
          ]),
        );
      } catch {
        this.logger.warn('DHA_PROFILE_MAP is not valid JSON — ignoring.');
      }
    }
    return { ...CONFIRMED_PROFILES, ...extra };
  }

  private stamp(resource: FhirResource, profiles: Record<string, string[]>): void {
    const profileList = profiles[resource.resourceType];
    if (!profileList || profileList.length === 0) {
      return;
    }
    const meta = (resource.meta = resource.meta ?? {}) as FhirMeta;
    meta.profile = Array.from(new Set([...(meta.profile ?? []), ...profileList]));
  }

  @Get()
  info(@Req() request: GatewayRequest) {
    return {
      service: 'dha-fhir',
      auth: 'Authorization: Basic (validated against OpenMRS)',
      usage:
        'GET /dha-fhir/<FHIR2 path>?<query> — proxied to OpenMRS FHIR2 R4 with the DHA Kenya Core meta.profile stamped and Conditions enriched with ICD-11 codings. Assembled resources: /Composition, /DetectedIssue, /AuditEvent, /Task; validation: POST /$validate, GET /validation-status, /validation-examples',
      stampedProfiles: this.profiles(),
      authenticatedAs: request.dhaEtlUser ?? null,
    };
  }

  /* ---------------- assembled resources (declared before the catch-all) ---------------- */

  private forwarded(request: GatewayRequest): ForwardHeaders {
    return {
      cookie: request.dhaEtlCookie,
      authorization: request.headers['authorization'] as string | undefined,
    };
  }

  /** FUNC-SUMM-001 — clinical summary as a Composition (in-process case-summary). */
  @Get('Composition')
  async composition(
    @Req() request: GatewayRequest,
    @Query('patientUuid') patientUuid: string,
    @Query('locationUuid') locationUuid: string,
  ) {
    if (!patientUuid || !locationUuid) {
      throw new HttpException(
        'patientUuid and locationUuid are required',
        HttpStatus.BAD_REQUEST,
      );
    }
    const resource = await this.resources.composition(patientUuid, locationUuid);
    this.stamp(resource, this.profiles());
    return resource;
  }

  /** FUNC-CDS-001 (patientUuid=…) / REP-PHE-001 (type=outbreak&startDate&endDate). */
  @Get('DetectedIssue')
  async detectedIssue(
    @Req() request: GatewayRequest,
    @Query('patientUuid') patientUuid?: string,
    @Query('type') type?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const profiles = this.profiles();
    if (type === 'outbreak') {
      if (!startDate || !endDate) {
        throw new HttpException(
          'startDate and endDate are required for outbreak issues',
          HttpStatus.BAD_REQUEST,
        );
      }
      const issues = await this.resources.detectedIssuesForOutbreak(
        startDate,
        endDate,
        this.forwarded(request),
      );
      issues.forEach((i) => this.stamp(i, profiles));
      return { resourceType: 'Bundle', type: 'searchset', total: issues.length, entry: issues.map((resource) => ({ resource })) };
    }
    if (!patientUuid) {
      throw new HttpException(
        'patientUuid is required (or type=outbreak with a period)',
        HttpStatus.BAD_REQUEST,
      );
    }
    const issues = await this.resources.detectedIssuesForPatient(
      patientUuid,
      this.forwarded(request),
    );
    issues.forEach((i) => this.stamp(i, profiles));
    return { resourceType: 'Bundle', type: 'searchset', total: issues.length, entry: issues.map((resource) => ({ resource })) };
  }

  /** SEC-AUDIT-001 — audit trail as core R4 AuditEvents. */
  @Get('AuditEvent')
  async auditEvent(@Query('patientUuid') patientUuid: string) {
    if (!patientUuid) {
      throw new HttpException('patientUuid is required', HttpStatus.BAD_REQUEST);
    }
    const events = await this.resources.auditEventsForPatient(patientUuid);
    return { resourceType: 'Bundle', type: 'searchset', total: events.length, entry: events.map((resource) => ({ resource })) };
  }

  /** REP-IHR-001 (status=requested) / INTER-HIE-001 (focus=Referral). */
  @Get('Task')
  async task(
    @Req() request: GatewayRequest,
    @Query('focus') focus?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('locationUuid') locationUuid?: string,
  ) {
    const profiles = this.profiles();
    let tasks: FhirResourceLike[];
    if (focus === 'Referral') {
      if (!locationUuid) {
        throw new HttpException('locationUuid is required for referral tasks', HttpStatus.BAD_REQUEST);
      }
      tasks = await this.resources.referralTasks(locationUuid);
    } else if (status === 'requested') {
      if (!startDate || !endDate) {
        throw new HttpException('startDate and endDate are required for the IHR queue', HttpStatus.BAD_REQUEST);
      }
      tasks = await this.resources.ihrTasks(startDate, endDate, this.forwarded(request));
    } else {
      throw new HttpException(
        "Use ?focus=Referral (referrals) or ?status=requested (IHR queue)",
        HttpStatus.BAD_REQUEST,
      );
    }
    tasks.forEach((t) => this.stamp(t, profiles));
    return { resourceType: 'Bundle', type: 'searchset', total: tasks.length, entry: tasks.map((resource) => ({ resource })) };
  }

  /**
   * SEC-INT-001 — live-session demonstration: submit a (wrong) dataset and
   * receive a FHIR OperationOutcome. Declared before the catch-all; the
   * portal attestation surface stays GET-only (validation-status +
   * validation-examples carry the GET evidence).
   */
  @Post('$validate')
  async validateResource(
    @Req() request: GatewayRequest,
    @Body() body: unknown,
  ) {
    return this.resources.validateSubmittedDataset(body, this.forwarded(request));
  }

  /** SEC-INT-001 — last OperationOutcome (GET-only portal evidence). */
  @Get('validation-status')
  validationStatus() {
    const last = this.resources.lastValidationOutcome;
    if (!last) {
      return {
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'information',
            code: 'informational',
            diagnostics:
              'No dataset has been validated yet — POST /dha-fhir/$validate to run one.',
          },
        ],
      };
    }
    return last;
  }

  /** SEC-INT-001 — a deliberately wrong dataset the lab can POST. */
  @Get('validation-examples')
  validationExamples() {
    return { examples: [this.resources.invalidExampleDataset()] };
  }

  /**
   * Derive the proxied sub-path from the original URL instead of the Express
   * 5 wildcard param: param capture mangles multi-segment values
   * ('Patient/<uuid>' arrived as 'Patient,<uuid>' on staging, causing HAPI-0302).
   * The controller mount is '/dha-fhir' — originalUrl as seen by this app is
   * '/dha-fhir/<sub-path>[?query]' (nginx strips the /openmrs/hie prefix).
   */
  private subPathFrom(request: GatewayRequest): string {
    const base = '/dha-fhir';
    const q = request.originalUrl.indexOf('?');
    let sub = (q >= 0 ? request.originalUrl.slice(0, q) : request.originalUrl).slice(base.length);
    try {
      sub = decodeURIComponent(sub);
    } catch {
      /* keep raw */
    }
    sub = sub.replace(/^\/+/, '');
    // Safety net: normalize a mangled 'Type,id' read back to 'Type/id'.
    if (sub.includes(',') && !sub.includes('/')) {
      const [head, tail] = sub.split(',');
      if (FHIR_RESOURCE_TYPES.has(head) && tail && /^[\w.-]+$/.test(tail)) {
        sub = `${head}/${tail}`;
      }
    }
    return sub;
  }

  @All('{*path}')
  async proxy(
    @Req() request: GatewayRequest,
    @Res() response: Response,
  ) {
    if (request.method !== 'GET') {
      throw new HttpException(
        'Only GET is supported on the DHA FHIR facade',
        HttpStatus.METHOD_NOT_ALLOWED,
      );
    }

    const queryStart = request.originalUrl.indexOf('?');
    const query = queryStart >= 0 ? request.originalUrl.slice(queryStart + 1) : '';
    const upstreamPath = this.subPathFrom(request);
    const url = `${this.fhir2Base()}/${upstreamPath.replace(/^\/+/, '')}${
      query ? `?${query}` : ''
    }`;

    try {
      const upstream = await fetch(url, {
        method: 'GET',
        headers: {
          accept: 'application/fhir+json',
          ...(request.dhaEtlCookie ? { cookie: request.dhaEtlCookie } : {}),
          ...(request.headers['authorization']
            ? { authorization: request.headers['authorization'] as string }
            : {}),
        },
        signal: AbortSignal.timeout(25000),
      });
      const contentType =
        upstream.headers.get('content-type') ?? 'application/fhir+json';
      const text = await upstream.text();

      if (contentType.includes('json') && upstream.status < 300) {
        try {
          const parsed = JSON.parse(text) as FhirResource;
          const profiles = this.profiles();
          if (parsed.resourceType === 'Bundle' && Array.isArray(parsed.entry)) {
            parsed.entry.forEach(
              (entry) => entry.resource && this.stamp(entry.resource, profiles),
            );
          } else {
            this.stamp(parsed, profiles);
          }
          // INTER-SEM: FHIR2 Conditions carry only the local concept UUID —
          // inject the ICD-11 coding from the concept_reference_map join.
          if (parsed.resourceType === 'Condition') {
            await this.resources.enrichConditionIcd11(parsed).catch((e) =>
              this.logger.warn(`ICD-11 enrichment skipped: ${String(e)}`),
            );
          } else if (parsed.resourceType === 'Bundle' && Array.isArray(parsed.entry)) {
            for (const entry of parsed.entry) {
              if (entry.resource?.resourceType === 'Condition') {
                await this.resources
                  .enrichConditionIcd11(entry.resource)
                  .catch((e) => this.logger.warn(`ICD-11 enrichment skipped: ${String(e)}`));
              }
            }
          }
          response
            .status(upstream.status)
            .type('application/fhir+json')
            .send(JSON.stringify(parsed));
          return;
        } catch {
          this.logger.warn('upstream returned non-parseable JSON body');
        }
      }
      response.status(upstream.status).type(contentType).send(text);
    } catch (error) {
      this.logger.warn(`dha-fhir proxy failed for ${url}: ${String(error)}`);
      const timedOut =
        error instanceof Error && /timeout|abort/i.test(error.message);
      response
        .status(timedOut ? HttpStatus.GATEWAY_TIMEOUT : HttpStatus.BAD_GATEWAY)
        .json({
          statusCode: timedOut
            ? HttpStatus.GATEWAY_TIMEOUT
            : HttpStatus.BAD_GATEWAY,
          error: timedOut ? 'Gateway Timeout' : 'Bad Gateway',
          message: timedOut
            ? 'Upstream FHIR2 did not respond within the facade timeout.'
            : 'Upstream FHIR2 request failed.',
        });
    }
  }
}
