import {
  All,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { BasicAuthGuard } from '../auth/guards/basic-auth-guard/basic-auth.guard';

interface GatewayRequest extends Request {
  dhaEtlCookie?: string;
  dhaEtlUser?: string;
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

  constructor(private readonly configService: ConfigService) {}

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
        'GET /dha-fhir/<FHIR2 path>?<query> — proxied to OpenMRS FHIR2 R4 with the DHA Kenya Core meta.profile stamped',
      stampedProfiles: this.profiles(),
      authenticatedAs: request.dhaEtlUser ?? null,
    };
  }

  @All('{*path}')
  async proxy(
    @Req() request: GatewayRequest,
    @Res() response: Response,
    @Param('path') rawPath: string,
  ) {
    if (request.method !== 'GET') {
      throw new HttpException(
        'Only GET is supported on the DHA FHIR facade',
        HttpStatus.METHOD_NOT_ALLOWED,
      );
    }

    const queryStart = request.originalUrl.indexOf('?');
    const query = queryStart >= 0 ? request.originalUrl.slice(queryStart + 1) : '';
    let upstreamPath: string;
    try {
      upstreamPath = decodeURIComponent(rawPath);
    } catch {
      upstreamPath = rawPath;
    }
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
