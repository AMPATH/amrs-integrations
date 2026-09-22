import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocationFacilityHelper } from '../../shared/utils/location-facility.helper';
import { SubmitShrBundleDto } from '../dto/submit-shr-bundle.dto';
import { ShrService } from '../shr.service';
import { buildShrVisitBundle, toFhirDateTime } from './fhir-bundle.mapper';
import { OpenMrsVisitClient } from './openmrs-visit.client';
import { ShaFhirClient } from './sha-fhir.client';
import {
  ACUITY_TO_DISPATCH_PRIORITY,
  DEFAULT_ACUITY_CONCEPT_MAP,
  DEFAULT_AMRS_CONCEPT_SYSTEM_URL,
  DEFAULT_AMRS_DERIVED_IDENTIFIER_SYSTEM,
  DEFAULT_AMRS_PRACTITIONER_IDENTIFIER_SYSTEM,
  DEFAULT_AMRS_SOURCE_URI,
  DEFAULT_CLINICAL_ENCOUNTER_CLASS,
  DEFAULT_PATIENT_IDENTIFIER_TYPES,
  DEFAULT_SHA_FHIR_CANONICAL_BASE,
  DEFAULT_SUBMISSION_FAMILY,
  DEFAULT_VISIT_TYPE_CLASS_MAP,
  DEFAULT_VITAL_SIGNS_CONCEPT_MAP,
  SHA_PATIENT_IDENTIFIER_SYSTEMS,
} from './sha-ig.constants';
import {
  MissingPreconditionError,
  OpenMrsPatient,
  OpenMrsVisit,
  ShaIssueSummary,
  ShrVisitBundleBuild,
  ShrVisitBundleOptions,
  VitalSignConceptMapping,
  VisitSubmissionFamily,
  VisitSubmissionResponse,
} from './types';
import { SubmitShrVisitDto } from './dto/submit-shr-visit.dto';

/**
 * `POST /shr/visit-submission` — submit one closed AMRS visit to the national
 * Shared Health Record as a SHA-IG-compliant FHIR bundle, in five steps:
 *
 *  1. accept `patientUuid` (the controller validated the request);
 *  2. gather the latest closed visit for the patient — with its encounters,
 *     observations and diagnoses — from OpenMRS, on the caller's session;
 *  3. map it to a bundle that satisfies the SHA FHIR IG (fhir-bundle.mapper.ts)
 *     — in the emergency family (the enforced em-* profiles) or the clinical
 *     family (a base-R4 Encounter for routine care), chosen by the request's
 *     `submissionFamily` or, under `auto`, by the AMRS visit type;
 *  4. pre-validate against the SHA FHIR server (`$validate`, never persists)
 *     when configured, then submit through DHA's middleware — the same
 *     `POST /shr/bundles` consent-token path `ShrService.submitBundle` uses;
 *  5. log a clear success or failure status, and answer with the structured
 *     outcome the DHA workflow app's frontend types mirror.
 *
 * Outcomes (`status` of the response — `skipped`/`validated`/`submitted` are
 * 200s; every failure throws an HttpException whose body is the same shape):
 *
 *   submitted  — DHA's middleware accepted the bundle
 *   validated  — dryRun: built (and optionally pre-validated), not submitted
 *   skipped    — the patient has no closed visit; nothing to do
 *   failed     — 400 missing consent token · 404 unknown patient · 409 visit
 *                not closed · 422 IG preconditions/validation unmet · 502
 *                upstream (OpenMRS / DHA middleware / SHA) failure
 */
@Injectable()
export class ShrVisitSubmissionService {
  constructor(
    private readonly openMrsVisitClient: OpenMrsVisitClient,
    private readonly shaFhirClient: ShaFhirClient,
    private readonly shrService: ShrService,
    private readonly locationFacilityHelper: LocationFacilityHelper,
    private readonly configService: ConfigService,
  ) {}

  async submitClosedVisit(
    dto: SubmitShrVisitDto,
    sessionCookie: string | undefined,
    consentTokenHeader?: string,
  ): Promise<VisitSubmissionResponse> {
    // ── Step 2: the latest closed visit (or the requested one) ────────────────
    const context = await this.gatherVisit(dto, sessionCookie);
    if (!context.visit) {
      // No closed visit — a normal outcome ("skipped"), not an error: the
      // caller may be polling as visits close.
      Logger.log(
        `SHR visit submission skipped: no closed visit for patient ${dto.patientUuid}`,
      );
      return {
        status: 'skipped',
        patientUuid: dto.patientUuid,
        message: 'No closed visit found for this patient — nothing to submit.',
      };
    }
    const visit = context.visit;
    const visitClosedAt = toFhirDateTime(visit.stopDatetime);

    // The facility this visit belongs to — Organization / serviceProvider and
    // the facility identity DHA's middleware itself enforces via headers.
    // ── Step 3: map to a SHA-IG-compliant collection bundle ────────────────────
    let build: ShrVisitBundleBuild;
    try {
      // The bundle family first: the request's explicit choice, or the visit
      // type's — inside the try so malformed config maps to the contract body.
      const family = this.resolveSubmissionFamily(dto, visit);
      const facility = await this.resolveFacility(dto.locationUuid);
      build = buildShrVisitBundle(
        context,
        this.mapperOptions(facility, family),
      );
    } catch (error) {
      if (error instanceof MissingPreconditionError) {
        throw new UnprocessableEntityException(
          this.failed(dto, {
            visitUuid: visit.uuid,
            visitClosedAt,
            message: error.message,
            errors: [error.message],
          }),
        );
      }
      throw this.rewrapAsFailure(error, dto);
    }
    if (build.warnings.length > 0) {
      Logger.warn(
        `SHR visit-submission mapping warnings for visit ${visit.uuid}: ${build.warnings.join(' | ')}`,
      );
    }
    Logger.log(
      `SHR visit bundle built for visit ${visit.uuid} (${build.family} family): ` +
        `${build.bundle.entry?.length ?? 0} entries ` +
        `(${Object.entries(build.stats)
          .map(([type, count]) => `${count} ${type}`)
          .join(
            ', ',
          )})${build.incidentId ? `, incident ${build.incidentId}` : ''}`,
    );

    // A submission through DHA's middleware needs a usable consent token; a
    // dry run does not. Caller-supplied first, the recorded consent session
    // (with its refresh/open-visit fallbacks) after.
    let consentToken = consentTokenHeader ?? dto.consentToken;
    let consentTokenSource: 'request' | 'active-consent' | undefined =
      consentToken ? 'request' : undefined;
    if (!dto.dryRun && !consentToken) {
      const resolved = await this.resolveConsentToken(
        context.patient,
        dto.locationUuid,
      );
      consentToken = resolved.token;
      consentTokenSource = resolved.source;
    }

    // ── Step 4a: optional pre-submission $validate against the SHA FHIR IG ───
    let validationIssues: ShaIssueSummary[] | undefined;
    if (this.prevalidateEnabled()) {
      const validation = await this.shaFhirClient.validateBundle(build.bundle);
      validationIssues = validation.issues;
      Logger.log(
        `SHA $validate for visit ${visit.uuid}: ${validation.ok ? 'passed' : 'FAILED'} ` +
          `(${validation.issues.length} issues, ${validation.blockingIssues.length} blocking)`,
      );
      if (!validation.ok) {
        const errors = validation.blockingIssues.map(
          (issue) =>
            issue.diagnostics ??
            `${issue.severity} at ${issue.location?.join(', ') ?? '?'}`,
        );
        Logger.error(
          `SHR visit submission blocked by validation for visit ${visit.uuid}: ${errors.join(' | ')}`,
        );
        throw new UnprocessableEntityException(
          this.failed(dto, {
            visitUuid: visit.uuid,
            visitClosedAt,
            entries: build.bundle.entry?.length ?? 0,
            validationIssues,
            warnings: build.warnings,
            message: 'The bundle did not pass SHA pre-submission validation.',
            errors,
          }),
        );
      }
    }

    // ── Dry run: stop before touching DHA's middleware ────────────────────────
    if (dto.dryRun) {
      Logger.log(
        `SHR visit submission dry run for visit ${visit.uuid}: bundle built and validated, nothing submitted`,
      );
      return {
        status: 'validated',
        patientUuid: dto.patientUuid,
        visitUuid: visit.uuid,
        visitClosedAt,
        submissionFamily: build.family,
        entries: build.bundle.entry?.length ?? 0,
        validationIssues,
        warnings: build.warnings,
        message:
          'Bundle built (and validated) — dry run, nothing was submitted.',
      };
    }

    // ── Step 4b: submit through DHA's middleware (POST /shr/bundles) ──────────
    const accepted = await this.submitBundle(
      build,
      dto,
      consentToken!,
      consentTokenSource!,
    );
    Logger.log(
      `SHR visit submission succeeded for visit ${visit.uuid}: mediator ${accepted.mediator_id} ` +
        `answered "${accepted.status ?? 'accepted'}" — ${accepted.message ?? ''}`,
    );
    return {
      status: 'submitted',
      patientUuid: dto.patientUuid,
      visitUuid: visit.uuid,
      visitClosedAt,
      submissionFamily: build.family,
      entries: build.bundle.entry?.length ?? 0,
      consentTokenSource,
      mediatorId: accepted.mediator_id,
      mediatorMessage: accepted.message,
      mediatorStatus: accepted.status,
      validationIssues,
      warnings: build.warnings,
      message: `Closed visit submitted to the SHR as a ${build.family}-family SHA-IG FHIR collection bundle.`,
    };
  }

  // ── Steps, isolated so each failure maps onto its own outcome ────────────────

  /** Step 2, with upstream errors rewrapped into the endpoint's contract. */
  private async gatherVisit(
    dto: SubmitShrVisitDto,
    sessionCookie: string | undefined,
  ) {
    try {
      return await this.openMrsVisitClient.fetchClosedVisitContext(
        dto.patientUuid,
        sessionCookie ?? '',
        { locationUuid: dto.locationUuid, visitUuid: dto.visitUuid },
      );
    } catch (error) {
      throw this.rewrapAsFailure(error, dto);
    }
  }

  /** The facility identity — missing frCode is a request problem, not ours. */
  private async resolveFacility(locationUuid: string): Promise<{
    code: string;
    name?: string;
  }> {
    const facility =
      await this.locationFacilityHelper.getFacilityUsingLocationUuid(
        locationUuid,
      );
    if (!facility) {
      throw new HttpException('Missing facility', HttpStatus.BAD_REQUEST);
    }
    if (!facility.frCode) {
      throw new HttpException('Missing facility code', HttpStatus.BAD_REQUEST);
    }
    return {
      code: facility.frCode,
      name: facility.facilityName ?? facility.locationName ?? undefined,
    };
  }

  /**
   * Best-effort consent token from the recorded consent session — the same
   * resolution `GET /shr/consents/active` performs (session → refresh →
   * open visits). Resolution failure is logged and answered with a 400 that
   * tells the caller to send a token, mirroring `ShrController.submitBundle`.
   */
  private async resolveConsentToken(
    patient: OpenMrsPatient,
    locationUuid: string,
  ): Promise<{ token: string; source: 'active-consent' }> {
    const crId = patient.identifiers?.find(
      (id) => id.identifierType?.uuid === this.crIdentifierTypeUuid(),
    )?.identifier;
    if (crId) {
      try {
        const active = await this.shrService.getActiveConsent({
          crId,
          locationUuid,
        });
        if (active.hasActiveConsent && active.consentToken) {
          return { token: active.consentToken, source: 'active-consent' };
        }
      } catch (error) {
        Logger.warn(
          `Could not resolve an active consent token for patient: ${(error as Error)?.message ?? error}`,
        );
      }
    }
    throw new BadRequestException(
      this.failed(
        { patientUuid: patient.uuid, locationUuid } as SubmitShrVisitDto,
        {
          message:
            'Missing consent token. Send it as the X-Consent-Token header or the consentToken field, ' +
            'or establish an SHR consent for this patient first.',
          errors: ['Missing consent token for the SHR submission.'],
        },
      ),
    );
  }

  /** Step 4b — submit through DHA's middleware, rewrapping any rejection. */
  private async submitBundle(
    build: ShrVisitBundleBuild,
    dto: SubmitShrVisitDto,
    consentToken: string,
    consentTokenSource: 'request' | 'active-consent',
  ) {
    try {
      return await this.shrService.submitBundle(
        build.bundle as unknown as SubmitShrBundleDto,
        dto.locationUuid,
        consentToken,
      );
    } catch (error) {
      const message =
        error instanceof HttpException
          ? ((error.getResponse() as { message?: string })?.message ??
            error.message)
          : ((error as Error)?.message ??
            'The DHA middleware rejected the bundle.');
      const status =
        error instanceof HttpException
          ? error.getStatus()
          : HttpStatus.BAD_GATEWAY;
      Logger.error(
        `SHR visit submission rejected for visit ${build.bundle.id}: ${message}`,
      );
      throw new HttpException(
        this.failed(dto, {
          visitUuid: dto.visitUuid,
          entries: build.bundle.entry?.length ?? 0,
          consentTokenSource,
          message: 'The SHR rejected the bundle.',
          errors: [message],
        }),
        status >= 400 && status < 600 ? status : HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // ── Configuration → mapper options ───────────────────────────────────────────

  /**
   * Which bundle family to build: the request's explicit choice, else the
   * AMRS visit type's configured family, else the configured default
   * (`SHA_DEFAULT_SUBMISSION_FAMILY` — itself defaulting to `emergency`, so
   * pre-existing deployments keep their exact behaviour).
   */
  private resolveSubmissionFamily(
    dto: SubmitShrVisitDto,
    visit: OpenMrsVisit,
  ): VisitSubmissionFamily {
    if (
      dto.submissionFamily === 'emergency' ||
      dto.submissionFamily === 'clinical'
    ) {
      return dto.submissionFamily;
    }
    const mapped = this.conceptMapEnv<VisitSubmissionFamily>(
      'SHA_VISIT_TYPE_FAMILY_MAP',
      (entry) => (entry === 'emergency' || entry === 'clinical' ? entry : null),
    )[visit.visitType?.uuid ?? ''];
    if (mapped) {
      return mapped;
    }
    const configured = this.configService.get<string>(
      'SHA_DEFAULT_SUBMISSION_FAMILY',
    );
    if (configured === 'emergency' || configured === 'clinical') {
      return configured;
    }
    if (configured && configured.trim()) {
      throw new HttpException(
        'Invalid SHR visit-submission configuration: ' +
          'SHA_DEFAULT_SUBMISSION_FAMILY must be "emergency" or "clinical"',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return DEFAULT_SUBMISSION_FAMILY;
  }

  /**
   * Everything site-specific the mapper needs, from env overrides over the
   * defaults pinned in sha-ig.constants.ts. Concept-map overrides arrive as
   * JSON objects keyed by AMRS concept UUID.
   */
  private mapperOptions(
    facility: {
      code: string;
      name?: string;
    },
    family: VisitSubmissionFamily,
  ): ShrVisitBundleOptions {
    return {
      family,
      shaCanonicalBase:
        this.configService.get<string>('SHA_FHIR_CANONICAL_BASE') ??
        this.configService.get<string>('SHA_FHIR_BASE_URL') ??
        DEFAULT_SHA_FHIR_CANONICAL_BASE,
      amrsSourceUri: DEFAULT_AMRS_SOURCE_URI,
      amrsConceptSystemUrl: DEFAULT_AMRS_CONCEPT_SYSTEM_URL,
      amrsDerivedIdentifierSystem: DEFAULT_AMRS_DERIVED_IDENTIFIER_SYSTEM,
      amrsPractitionerIdentifierSystem:
        DEFAULT_AMRS_PRACTITIONER_IDENTIFIER_SYSTEM,
      patientIdentifierTypes: {
        crNumber:
          this.configService.get<string>('SHA_CR_IDENTIFIER_TYPE_UUID') ??
          DEFAULT_PATIENT_IDENTIFIER_TYPES.crNumber,
        upi:
          this.configService.get<string>('SHA_UPI_IDENTIFIER_TYPE_UUID') ??
          DEFAULT_PATIENT_IDENTIFIER_TYPES.upi,
        nationalId:
          this.configService.get<string>(
            'SHA_NATIONAL_ID_IDENTIFIER_TYPE_UUID',
          ) ?? DEFAULT_PATIENT_IDENTIFIER_TYPES.nationalId,
        shaNumber:
          this.configService.get<string>(
            'SHA_SHA_NUMBER_IDENTIFIER_TYPE_UUID',
          ) ?? DEFAULT_PATIENT_IDENTIFIER_TYPES.shaNumber,
        birthCertificate:
          this.configService.get<string>(
            'SHA_BIRTH_CERTIFICATE_IDENTIFIER_TYPE_UUID',
          ) ?? DEFAULT_PATIENT_IDENTIFIER_TYPES.birthCertificate,
      },
      patientIdentifierSystems: SHA_PATIENT_IDENTIFIER_SYSTEMS,
      vitalSignsConceptMap: {
        ...DEFAULT_VITAL_SIGNS_CONCEPT_MAP,
        ...this.conceptMapEnv<VitalSignConceptMapping>(
          'SHA_VITAL_SIGNS_CONCEPT_MAP',
          (entry) =>
            entry &&
            typeof entry === 'object' &&
            typeof (entry as Record<string, unknown>).loinc === 'string' &&
            (entry as Record<string, unknown>).loinc
              ? (entry as VitalSignConceptMapping)
              : null,
        ),
      },
      acuityConceptMap: {
        ...DEFAULT_ACUITY_CONCEPT_MAP,
        ...this.conceptMapEnv<string>('SHA_ACUITY_CONCEPT_MAP', (entry) =>
          typeof entry === 'string' && entry in ACUITY_TO_DISPATCH_PRIORITY
            ? entry
            : null,
        ),
      },
      incidentIdAttributeTypeUuid:
        this.configService.get<string>('SHA_INCIDENT_ID_ATTRIBUTE_TYPE_UUID') ??
        '',
      dispatchIdAttributeTypeUuid:
        this.configService.get<string>('SHA_DISPATCH_ID_ATTRIBUTE_TYPE_UUID') ??
        '',
      incidentTypeCode:
        this.configService.get<string>('SHA_INCIDENT_TYPE_CODE') ?? 'medical',
      visitTypeClassMap: {
        ...DEFAULT_VISIT_TYPE_CLASS_MAP,
        ...this.conceptMapEnv<string>('SHA_VISIT_TYPE_CLASS_MAP', (entry) =>
          typeof entry === 'string' && entry ? entry : null,
        ),
      },
      defaultEncounterClass:
        this.configService.get<string>('SHA_CLINICAL_ENCOUNTER_CLASS') ??
        DEFAULT_CLINICAL_ENCOUNTER_CLASS,
      facility,
      maxObservationsPerBundle:
        Number(
          this.configService.get<string>('SHA_MAX_OBSERVATIONS_PER_BUNDLE'),
        ) || 500,
      maxBundleEntries: 1000,
    };
  }

  /**
   * Parse a JSON-object env override keyed by AMRS concept UUID. `validate`
   * coerces each entry (an object for vitals mappings, a plain acuity code
   * string for the acuity map) and returns null to reject it. A malformed
   * override must fail the request loudly rather than silently map concepts
   * to nothing.
   */
  private conceptMapEnv<T>(
    key: string,
    validate: (entry: unknown) => T | null,
  ): Record<string, T> {
    const raw = this.configService.get<string>(key);
    if (!raw || !raw.trim()) {
      return {};
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('not an object');
      }
    } catch {
      throw new HttpException(
        `Invalid SHR visit-submission configuration: ${key} is not a valid JSON object`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    const map: Record<string, T> = {};
    for (const [conceptUuid, entry] of Object.entries(parsed)) {
      const valid = validate(entry);
      if (valid === null) {
        throw new HttpException(
          `Invalid SHR visit-submission configuration: ${key}[${conceptUuid}] is not a valid mapping`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      map[conceptUuid] = valid;
    }
    return map;
  }

  /** $validate runs only when a FHIR base is configured and not switched off. */
  private prevalidateEnabled(): boolean {
    if (!this.configService.get<string>('SHA_FHIR_BASE_URL')) {
      return false;
    }
    const raw = this.configService.get<string>('SHA_FHIR_PREVALIDATE');
    if (raw === undefined || raw === '') {
      return true;
    }
    return !['false', '0', 'no', 'off'].includes(raw.trim().toLowerCase());
  }

  private crIdentifierTypeUuid(): string {
    return (
      this.configService.get<string>('SHA_CR_IDENTIFIER_TYPE_UUID') ??
      DEFAULT_PATIENT_IDENTIFIER_TYPES.crNumber
    );
  }

  // ── Failure bodies ───────────────────────────────────────────────────────────

  /** The endpoint's failure body — thrown inside HttpExceptions. */
  private failed(
    dto: { patientUuid: string },
    details: Partial<VisitSubmissionResponse>,
  ): VisitSubmissionResponse {
    return {
      status: 'failed',
      patientUuid: dto.patientUuid,
      ...details,
    };
  }

  /**
   * Gather-step failures already carry the right HTTP semantics from the
   * OpenMRS client (404 unknown patient, 409 visit not closed, 502 upstream);
   * rewrap them so every failure answers in this endpoint's own contract.
   */
  private rewrapAsFailure(
    error: unknown,
    dto: SubmitShrVisitDto,
  ): HttpException {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : ((response as { message?: string }).message ?? error.message);
      return new HttpException(
        this.failed(dto, { message, errors: [message] }),
        error.getStatus(),
      );
    }
    Logger.error(error);
    const message =
      (error as Error)?.message ??
      'Unexpected error during SHR visit submission.';
    return new HttpException(
      this.failed(dto, { message, errors: [message] }),
      HttpStatus.BAD_GATEWAY,
    );
  }
}
