/**
 * ShrVisitSubmissionService tests — the full five-step workflow with every
 * dependency mocked at its boundary (OpenMRS client, SHA $validate client,
 * ShrService's middleware/consent calls, facility helper, ConfigService):
 * the latest-closed-visit selection, the bundle-family selection (request
 * override → visit-type map → configured default), the mapping, the
 * consent-token resolution chain, optional pre-validation, submission through
 * DHA's middleware, and the outcome mapping.
 */

import { ConfigService } from '@nestjs/config';
import { HttpException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LocationFacilityHelper } from '../../shared/utils/location-facility.helper';
import { ShrService } from '../shr.service';
import { OpenMrsVisitClient } from './openmrs-visit.client';
import { ShaFhirClient } from './sha-fhir.client';
import { ShrVisitSubmissionService } from './shr-visit-submission.service';
import { SubmitShrVisitDto } from './dto/submit-shr-visit.dto';
import type { SubmitShrBundleDto } from '../dto/submit-shr-bundle.dto';
import type { FhirBundle, ShaValidationOutcome } from './types';
import {
  closedVisitContextFixture,
  encounterFixture,
  FACILITY_CODE,
  LOCATION_UUID,
  PATIENT_UUID,
  VISIT_TYPE_UUID,
  VISIT_UUID,
} from './shr-visit-submission.fixture';

/** The request body, as the controller would hand it over (already validated). */
function dtoFor(overrides: Partial<SubmitShrVisitDto> = {}): SubmitShrVisitDto {
  return {
    patientUuid: PATIENT_UUID,
    locationUuid: LOCATION_UUID,
    ...overrides,
  };
}

/** A passing $validate outcome with no issues. */
function validateOk(): ShaValidationOutcome {
  return { ok: true, httpStatus: 200, issues: [], blockingIssues: [] };
}

describe('ShrVisitSubmissionService', () => {
  let service: ShrVisitSubmissionService;
  let fetchClosedVisitContext: jest.Mock;
  let validateBundle: jest.Mock;
  let submitBundle: jest.Mock;
  let getActiveConsent: jest.Mock;
  let getFacilityUsingLocationUuid: jest.Mock;
  let env: Record<string, string>;

  beforeEach(async () => {
    jest.resetAllMocks();
    fetchClosedVisitContext = jest.fn();
    validateBundle = jest.fn();
    submitBundle = jest.fn();
    getActiveConsent = jest.fn();
    getFacilityUsingLocationUuid = jest.fn();
    // Env over ConfigService — SHA_FHIR_BASE_URL set means pre-validation on.
    env = { SHA_FHIR_BASE_URL: 'https://sha.test/fhir' };

    const module = await Test.createTestingModule({
      providers: [
        ShrVisitSubmissionService,
        { provide: OpenMrsVisitClient, useValue: { fetchClosedVisitContext } },
        { provide: ShaFhirClient, useValue: { validateBundle } },
        { provide: ShrService, useValue: { submitBundle, getActiveConsent } },
        {
          provide: LocationFacilityHelper,
          useValue: { getFacilityUsingLocationUuid },
        },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => env[key] },
        },
      ],
    }).compile();
    service = module.get(ShrVisitSubmissionService);

    // The happy-path defaults; individual tests override what they need.
    fetchClosedVisitContext.mockResolvedValue(closedVisitContextFixture());
    getFacilityUsingLocationUuid.mockResolvedValue({
      frCode: FACILITY_CODE,
      facilityName: 'AMRS Test Clinic',
    });
    validateBundle.mockResolvedValue(validateOk());
    submitBundle.mockResolvedValue({
      mediator_id: 'mediator-1',
      message: 'Bundle accepted',
      status: 'accepted',
    });
    getActiveConsent.mockResolvedValue({
      hasActiveConsent: true,
      consentToken: 'recorded-token',
    });
  });

  it('submits the latest closed visit end to end (status "submitted")', async () => {
    const response = await service.submitClosedVisit(
      dtoFor(),
      'session-cookie-1',
      'token-from-header',
    );

    expect(response.status).toBe('submitted');
    expect(response.patientUuid).toBe(PATIENT_UUID);
    expect(response.visitUuid).toBe(VISIT_UUID);
    // Normalized closure datetime (FHIR offset format).
    expect(response.visitClosedAt).toBe('2026-09-01T11:30:00+03:00');
    expect(response.entries ?? 0).toBeGreaterThanOrEqual(8);
    expect(response.consentTokenSource).toBe('request');
    expect(response.mediatorId).toBe('mediator-1');
    expect(response.mediatorMessage).toBe('Bundle accepted');
    expect(response.mediatorStatus).toBe('accepted');

    // The gather ran on the caller's session, scoped to the location.
    expect(fetchClosedVisitContext).toHaveBeenCalledWith(
      PATIENT_UUID,
      'session-cookie-1',
      {
        locationUuid: LOCATION_UUID,
        visitUuid: undefined,
      },
    );

    // The bundle that went to DHA's middleware: a collection bundle with an
    // id, urn:uuid entries, and no transaction mechanics.
    const [bundle, locationUuid, consentToken] = submitBundle.mock.calls[0] as [
      SubmitShrBundleDto,
      string,
      string,
    ];
    expect(locationUuid).toBe(LOCATION_UUID);
    expect(consentToken).toBe('token-from-header');
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('collection');
    expect(bundle.id).toBeTruthy();
    for (const entry of bundle.entry) {
      expect(entry.fullUrl.startsWith('urn:uuid:')).toBe(true);
      expect(entry.request).toBeUndefined();
    }
    expect(getActiveConsent).not.toHaveBeenCalled();
  });

  it('resolves the consent token from the recorded session when none is supplied', async () => {
    const response = await service.submitClosedVisit(
      dtoFor(),
      'session-cookie-1',
    );

    expect(response.status).toBe('submitted');
    expect(response.consentTokenSource).toBe('active-consent');
    // The CR number comes from the patient's identifiers — the same resolution
    // GET /shr/consents/active performs.
    expect(getActiveConsent).toHaveBeenCalledWith({
      crId: 'CR-123456',
      locationUuid: LOCATION_UUID,
    });
    expect(submitBundle.mock.calls[0][2]).toBe('recorded-token');
  });

  it('answers 400 when no consent token can be resolved', async () => {
    getActiveConsent.mockResolvedValue({
      hasActiveConsent: false,
      consentToken: null,
    });
    const failure = await service
      .submitClosedVisit(dtoFor(), 'session-cookie-1')
      .catch((error: unknown) => error as HttpException);

    expect(failure).toBeInstanceOf(HttpException);
    expect(failure.getStatus()).toBe(400);
    const body = failure.getResponse() as { status: string; errors: string[] };
    expect(body.status).toBe('failed');
    expect(body.errors[0]).toContain('Missing consent token');
    expect(submitBundle).not.toHaveBeenCalled();
  });

  it('reports "skipped" when the patient has no closed visit', async () => {
    fetchClosedVisitContext.mockResolvedValue({
      ...closedVisitContextFixture(),
      visit: null,
    });
    const response = await service.submitClosedVisit(
      dtoFor(),
      'session-cookie-1',
      'token-from-header',
    );

    expect(response.status).toBe('skipped');
    expect(response.message).toContain('No closed visit');
    // No mapping, no validation, no submission, no consent lookup.
    expect(validateBundle).not.toHaveBeenCalled();
    expect(submitBundle).not.toHaveBeenCalled();
    expect(getActiveConsent).not.toHaveBeenCalled();
  });

  it('maps an unknown patient to 404 in the endpoint contract', async () => {
    fetchClosedVisitContext.mockRejectedValue(
      new NotFoundException(`No patient found for uuid ${PATIENT_UUID}`),
    );
    const failure = await service
      .submitClosedVisit(dtoFor(), 'session-cookie-1')
      .catch((error: unknown) => error as HttpException);

    expect(failure.getStatus()).toBe(404);
    const body = failure.getResponse() as { status: string; errors: string[] };
    expect(body.status).toBe('failed');
    expect(body.errors[0]).toContain('No patient found');
  });

  it('maps a visit without any encounter provider to 422 (IG precondition)', async () => {
    fetchClosedVisitContext.mockResolvedValue({
      ...closedVisitContextFixture(),
      encounters: [encounterFixture({ encounterProviders: [] })],
    });
    const failure = await service
      .submitClosedVisit(dtoFor(), 'session-cookie-1', 'token-from-header')
      .catch((error: unknown) => error as HttpException);

    expect(failure.getStatus()).toBe(422);
    const body = failure.getResponse() as { status: string; errors: string[] };
    expect(body.status).toBe('failed');
    expect(body.errors[0]).toContain('provider');
  });

  it('maps a missing facility code to 400 in the endpoint contract', async () => {
    getFacilityUsingLocationUuid.mockResolvedValue({ frCode: null });
    const failure = await service
      .submitClosedVisit(dtoFor(), 'session-cookie-1', 'token-from-header')
      .catch((error: unknown) => error as HttpException);

    expect(failure.getStatus()).toBe(400);
    const body = failure.getResponse() as { status: string; errors: string[] };
    expect(body.status).toBe('failed');
    expect(body.errors[0]).toContain('facility');
  });

  it('blocks submission on non-defect validation errors (422), surfacing the issues', async () => {
    validateBundle.mockResolvedValue({
      ok: false,
      httpStatus: 200,
      issues: [
        {
          severity: 'error',
          diagnostics: 'Encounter.period: Period start must be <= end',
        },
        {
          severity: 'error',
          diagnostics:
            'None of the codings provided are in the value set em-clinical-acuity',
          knownTerminologyDefect: true,
        },
      ],
      blockingIssues: [
        {
          severity: 'error',
          diagnostics: 'Encounter.period: Period start must be <= end',
        },
      ],
    });
    const failure = await service
      .submitClosedVisit(dtoFor(), 'session-cookie-1', 'token-from-header')
      .catch((error: unknown) => error as HttpException);

    expect(failure.getStatus()).toBe(422);
    const body = failure.getResponse() as {
      status: string;
      validationIssues: Array<{ knownTerminologyDefect?: boolean }>;
      errors: string[];
    };
    expect(body.status).toBe('failed');
    expect(body.validationIssues.length).toBe(2);
    expect(
      body.validationIssues.filter((issue) => issue.knownTerminologyDefect)
        .length,
    ).toBe(1);
    expect(body.errors[0]).toContain('Period start');
    // Must NOT have submitted after a failed validation.
    expect(submitBundle).not.toHaveBeenCalled();
  });

  it('submits despite the known terminology defect in non-strict mode', async () => {
    validateBundle.mockResolvedValue({
      ok: true,
      httpStatus: 200,
      issues: [
        {
          severity: 'error',
          diagnostics:
            'No codes in ValueSet belong to CodeSystem em-incident-type',
          knownTerminologyDefect: true,
        },
      ],
      blockingIssues: [],
    });
    const response = await service.submitClosedVisit(
      dtoFor(),
      'session-cookie-1',
      'token-from-header',
    );

    expect(response.status).toBe('submitted');
    expect(response.validationIssues?.length).toBe(1);
  });

  it('dryRun builds and validates but never submits (status "validated")', async () => {
    const response = await service.submitClosedVisit(
      dtoFor({ dryRun: true }),
      'session-cookie-1',
    );

    expect(response.status).toBe('validated');
    expect(response.entries ?? 0).toBeGreaterThanOrEqual(8);
    expect(response.message).toContain('dry run');
    expect(validateBundle).toHaveBeenCalledTimes(1);
    expect(submitBundle).not.toHaveBeenCalled();
    // A dry run needs no consent token at all.
    expect(getActiveConsent).not.toHaveBeenCalled();
  });

  it('maps a DHA middleware rejection to the same status with the mediator message', async () => {
    submitBundle.mockRejectedValue(
      new HttpException('Mediator rejected the bundle', 422),
    );
    const failure = await service
      .submitClosedVisit(dtoFor(), 'session-cookie-1', 'token-from-header')
      .catch((error: unknown) => error as HttpException);

    expect(failure.getStatus()).toBe(422);
    const body = failure.getResponse() as { status: string; errors: string[] };
    expect(body.status).toBe('failed');
    expect(body.errors[0]).toContain('Mediator rejected the bundle');
  });

  it('skips pre-validation when SHA_FHIR_PREVALIDATE=false and submits directly', async () => {
    env.SHA_FHIR_PREVALIDATE = 'false';
    const response = await service.submitClosedVisit(
      dtoFor(),
      'session-cookie-1',
      'token-from-header',
    );

    expect(response.status).toBe('submitted');
    expect(response.validationIssues).toBeUndefined();
    expect(validateBundle).not.toHaveBeenCalled();
    expect(submitBundle).toHaveBeenCalledTimes(1);
  });

  it('skips pre-validation when no SHA FHIR base is configured', async () => {
    env = {};
    const response = await service.submitClosedVisit(
      dtoFor(),
      'session-cookie-1',
      'token-from-header',
    );

    expect(response.status).toBe('submitted');
    expect(validateBundle).not.toHaveBeenCalled();
  });

  it('produces a deterministic bundle for the same closed visit', async () => {
    await service.submitClosedVisit(
      dtoFor({ dryRun: true }),
      'session-cookie-1',
    );
    await service.submitClosedVisit(
      dtoFor({ dryRun: true }),
      'session-cookie-1',
    );

    const [first] = validateBundle.mock.calls[0] as [FhirBundle];
    const [second] = validateBundle.mock.calls[1] as [FhirBundle];
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('selects the explicitly requested visit and passes it to the gather', async () => {
    await service.submitClosedVisit(
      dtoFor({ visitUuid: VISIT_UUID }),
      'session-cookie-1',
      'token-from-header',
    );

    expect(fetchClosedVisitContext).toHaveBeenCalledWith(
      PATIENT_UUID,
      'session-cookie-1',
      {
        locationUuid: LOCATION_UUID,
        visitUuid: VISIT_UUID,
      },
    );
  });

  // ── Bundle-family selection (submissionFamily) ────────────────────────────────

  it('defaults to the emergency family when none is requested', async () => {
    const response = await service.submitClosedVisit(
      dtoFor(),
      'session-cookie-1',
      'token-from-header',
    );

    expect(response.submissionFamily).toBe('emergency');
    // The emergency scaffolding: one incident + one PoC encounter, one episode.
    const [bundle] = submitBundle.mock.calls[0] as [SubmitShrBundleDto];
    const types = bundle.entry.map((entry) => entry.resource.resourceType);
    expect(types.filter((type) => type === 'Encounter').length).toBe(2);
    expect(types.filter((type) => type === 'EpisodeOfCare').length).toBe(1);
  });

  it('builds the clinical family when requested (submissionFamily: "clinical")', async () => {
    const response = await service.submitClosedVisit(
      dtoFor({ submissionFamily: 'clinical' }),
      'session-cookie-1',
      'token-from-header',
    );

    expect(response.submissionFamily).toBe('clinical');
    const [bundle] = submitBundle.mock.calls[0] as [SubmitShrBundleDto];
    const encounters = bundle.entry.filter(
      (entry) => entry.resource.resourceType === 'Encounter',
    );
    expect(
      bundle.entry.filter(
        (entry) => entry.resource.resourceType === 'EpisodeOfCare',
      ),
    ).toEqual([]);
    expect(encounters.length).toBe(1);
    expect(encounters[0].resource.class).toMatchObject({ code: 'AMB' });
  });

  it('auto-selects the family from SHA_VISIT_TYPE_FAMILY_MAP when the request says auto', async () => {
    env.SHA_VISIT_TYPE_FAMILY_MAP = JSON.stringify({
      [VISIT_TYPE_UUID]: 'clinical',
    });
    const response = await service.submitClosedVisit(
      dtoFor(),
      'session-cookie-1',
      'token-from-header',
    );

    expect(response.submissionFamily).toBe('clinical');
  });

  it('falls back to SHA_DEFAULT_SUBMISSION_FAMILY for unmapped visit types', async () => {
    env.SHA_DEFAULT_SUBMISSION_FAMILY = 'clinical';
    const response = await service.submitClosedVisit(
      dtoFor(),
      'session-cookie-1',
      'token-from-header',
    );

    expect(response.submissionFamily).toBe('clinical');
  });

  it('fails loudly on an invalid SHA_VISIT_TYPE_FAMILY_MAP entry (500)', async () => {
    env.SHA_VISIT_TYPE_FAMILY_MAP = JSON.stringify({
      [VISIT_TYPE_UUID]: 'triage',
    });
    const failure = await service
      .submitClosedVisit(dtoFor(), 'session-cookie-1', 'token-from-header')
      .catch((error: unknown) => error as HttpException);

    expect(failure).toBeInstanceOf(HttpException);
    expect(failure.getStatus()).toBe(500);
    const body = failure.getResponse() as { errors: string[] };
    expect(body.errors[0]).toContain('SHA_VISIT_TYPE_FAMILY_MAP');
    expect(submitBundle).not.toHaveBeenCalled();
  });

  it('fails loudly on an invalid SHA_DEFAULT_SUBMISSION_FAMILY (500)', async () => {
    env.SHA_DEFAULT_SUBMISSION_FAMILY = 'triage';
    const failure = await service
      .submitClosedVisit(dtoFor(), 'session-cookie-1', 'token-from-header')
      .catch((error: unknown) => error as HttpException);

    expect(failure).toBeInstanceOf(HttpException);
    expect(failure.getStatus()).toBe(500);
    const body = failure.getResponse() as { errors: string[] };
    expect(body.errors[0]).toContain('SHA_DEFAULT_SUBMISSION_FAMILY');
    expect(submitBundle).not.toHaveBeenCalled();
  });

  it('submits a providerless visit under the clinical family (no IG precondition in base R4)', async () => {
    fetchClosedVisitContext.mockResolvedValue({
      ...closedVisitContextFixture(),
      encounters: [encounterFixture({ encounterProviders: [] })],
    });
    const response = await service.submitClosedVisit(
      dtoFor({ submissionFamily: 'clinical' }),
      'session-cookie-1',
      'token-from-header',
    );

    // The emergency family 422s here; clinical emits the care it has.
    expect(response.status).toBe('submitted');
    expect(response.submissionFamily).toBe('clinical');
  });
});
