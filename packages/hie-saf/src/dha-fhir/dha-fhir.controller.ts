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
 * Confirmed by the laboratory (NC-3, field-test feedback 12 Nov 2026):
 * resubmit the same Patient with exactly this meta.profile value.
 * Profiles for other resource types are intentionally NOT fabricated —
 * add them via DHA_PROFILE_MAP when DHA confirms the canonicals
 * (http://hl7.dha.go.ke/ig/core is not publicly resolvable, NXDOMAIN).
 */
const CONFIRMED_PROFILES: Record<string, string> = {
  Patient: 'http://hl7.dha.go.ke/ig/core/StructureDefinition/kenya-core-patient/0.1.0',
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

  private profiles(): Record<string, string> {
    let extra: Record<string, string> = {};
    const raw = this.configService.get<string>('DHA_PROFILE_MAP');
    if (raw) {
      try {
        extra = JSON.parse(raw) as Record<string, string>;
      } catch {
        this.logger.warn('DHA_PROFILE_MAP is not valid JSON — ignoring.');
      }
    }
    return { ...CONFIRMED_PROFILES, ...extra };
  }

  private stamp(resource: FhirResource, profiles: Record<string, string>): void {
    const profile = profiles[resource.resourceType];
    if (!profile) {
      return;
    }
    const meta = (resource.meta = resource.meta ?? {}) as FhirMeta;
    meta.profile = Array.from(new Set([...(meta.profile ?? []), profile]));
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
