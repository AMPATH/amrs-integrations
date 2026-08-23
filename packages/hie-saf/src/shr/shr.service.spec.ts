import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { HieHttpRequests } from '../hie-http-request/hie-http-requests';
import { LocationFacilityHelper } from '../shared/utils/location-facility.helper';
import { ShrConsentSessionStore } from './shr-consent-session.store';
import { CONSENT_TOKEN_HEADER, ShrService } from './shr.service';
import {
  ShrActiveConsentSource,
  ShrConsentDecision,
  ShrFlag,
  ShrRepresentativeRelationship,
  ShrVisitType,
} from './types';

const BASE_URL = 'https://ilm-dev.dha.go.ke/uat-middleware/api/v1';

const upstreamResponse = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  text: () => Promise.resolve(JSON.stringify(body)),
});

/** Unsigned stand-in for a DHA consent token, so `exp`/`sub` can be steered. */
const tokenWith = (claims: Record<string, unknown>) =>
  [
    Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString(
      'base64url',
    ),
    Buffer.from(JSON.stringify(claims)).toString('base64url'),
    'signature',
  ].join('.');

const inOneHour = () => Math.floor(Date.now() / 1000) + 3600;

describe('ShrService', () => {
  let service: ShrService;
  const hieHttpRequests = {
    sendGetRequest: jest.fn(),
    sendPostRequest: jest.fn(),
  };
  const configService = { get: jest.fn() };
  const locationFacilityHelper = { getFacilityUsingLocationUuid: jest.fn() };
  const consentSessionStore = {
    findOpenSession: jest.fn(),
    recordIssuedToken: jest.fn(),
    recordRefreshedToken: jest.fn(),
    markClosedByVisit: jest.fn(),
    markClosedByConsent: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    configService.get.mockReturnValue(BASE_URL);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShrService,
        { provide: HieHttpRequests, useValue: hieHttpRequests },
        { provide: ConfigService, useValue: configService },
        { provide: LocationFacilityHelper, useValue: locationFacilityHelper },
        { provide: ShrConsentSessionStore, useValue: consentSessionStore },
      ],
    }).compile();

    service = module.get<ShrService>(ShrService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('requestConsent', () => {
    it('resolves facility_id from the location and sends only the fields it was given', async () => {
      locationFacilityHelper.getFacilityUsingLocationUuid.mockResolvedValue({
        frCode: 'FID-123',
      });
      hieHttpRequests.sendPostRequest.mockResolvedValue(
        upstreamResponse({ consent_id: 'c-1', otp_record: 'otp-1' }),
      );

      const result = await service.requestConsent({
        crId: 'CR-1',
        requestedBy: 'Dr Test',
        visitType: ShrVisitType.OutPatient,
        locationUuid: 'loc-1',
      });

      expect(hieHttpRequests.sendPostRequest).toHaveBeenCalledWith(
        `${BASE_URL}/shr/consents`,
        {
          cr_id: 'CR-1',
          facility_id: 'FID-123',
          requested_by: 'Dr Test',
          visit_type: 'OP',
        },
        'loc-1',
        undefined,
      );
      expect(result.consent_id).toBe('c-1');
      // Standard request: no token yet, so nothing to record.
      expect(consentSessionStore.recordIssuedToken).not.toHaveBeenCalled();
    });

    it('forwards the resolved practitioner id when the caller supplies one', async () => {
      locationFacilityHelper.getFacilityUsingLocationUuid.mockResolvedValue({
        frCode: 'FID-123',
      });
      hieHttpRequests.sendPostRequest.mockResolvedValue(
        upstreamResponse({ consent_id: 'c-1', otp_record: 'otp-1' }),
      );

      await service.requestConsent(
        {
          crId: 'CR-1',
          requestedBy: 'Dr Test',
          visitType: ShrVisitType.InPatient,
          locationUuid: 'loc-1',
        },
        'PUID-0000443-3',
      );

      expect(hieHttpRequests.sendPostRequest.mock.calls[0][1]).toMatchObject({
        practitioner_id: 'PUID-0000443-3',
      });
    });

    it('maps the dependant fields to the documented snake_case payload', async () => {
      locationFacilityHelper.getFacilityUsingLocationUuid.mockResolvedValue({
        frCode: 'FID-123',
      });
      hieHttpRequests.sendPostRequest.mockResolvedValue(
        upstreamResponse({ consent_id: 'c-1', otp_record: 'otp-1' }),
      );

      await service.requestConsent({
        crId: 'CR-1',
        requestedBy: 'Registration Clerk',
        visitType: ShrVisitType.OutPatient,
        emergency: ShrFlag.No,
        patientCapable: ShrFlag.No,
        incapacityReason: 'Incapacitated adult',
        representativeCrId: 'CR-2',
        representativeRelationship:
          ShrRepresentativeRelationship.HealthcareProxy,
        startDate: '2026-07-18',
        locationUuid: 'loc-1',
      });

      expect(hieHttpRequests.sendPostRequest).toHaveBeenCalledWith(
        `${BASE_URL}/shr/consents`,
        {
          cr_id: 'CR-1',
          facility_id: 'FID-123',
          requested_by: 'Registration Clerk',
          visit_type: 'OP',
          emergency: 0,
          patient_capable: 0,
          incapacity_reason: 'Incapacitated adult',
          representative_cr_id: 'CR-2',
          representative_relationship: 'Healthcare Proxy',
          start_date: '2026-07-18',
        },
        'loc-1',
        undefined,
      );
    });

    it('records the consent session for an emergency consent, which never reaches verify', async () => {
      const consentToken = tokenWith({ exp: inOneHour(), sub: 'CR-1' });
      locationFacilityHelper.getFacilityUsingLocationUuid.mockResolvedValue({
        frCode: 'FID-123',
      });
      hieHttpRequests.sendPostRequest.mockResolvedValue(
        upstreamResponse({
          consent_id: 'c-1',
          consent_status: 'Approved',
          consent_token: consentToken,
          emergency: true,
          visit_id: 'v-1',
        }),
      );

      const result = await service.requestConsent({
        crId: 'CR-1',
        requestedBy: 'Dr Test',
        visitType: ShrVisitType.InPatient,
        emergency: ShrFlag.Yes,
        incapacityReason: 'Unconscious on arrival',
        locationUuid: 'loc-1',
      });

      expect(hieHttpRequests.sendPostRequest.mock.calls[0][1]).toMatchObject({
        emergency: 1,
        incapacity_reason: 'Unconscious on arrival',
      });
      expect(consentSessionStore.recordIssuedToken).toHaveBeenCalledWith({
        crId: 'CR-1',
        locationUuid: 'loc-1',
        visitId: 'v-1',
        consentToken,
        consentId: 'c-1',
      });
      // The emergency shape has to stay distinguishable from the OTP shape.
      expect(result.consent_token).toBe(consentToken);
      expect(result.otp_record).toBeUndefined();
    });

    it('rejects a consent request when the location has no facility code', async () => {
      locationFacilityHelper.getFacilityUsingLocationUuid.mockResolvedValue({
        frCode: null,
      });

      await expect(
        service.requestConsent({
          crId: 'CR-1',
          requestedBy: 'Dr Test',
          visitType: ShrVisitType.InPatient,
          locationUuid: 'loc-1',
        }),
      ).rejects.toThrow(HttpException);
      expect(hieHttpRequests.sendPostRequest).not.toHaveBeenCalled();
    });
  });

  describe('verifyConsent', () => {
    it('maps the otp record to snake_case and records the session on approval', async () => {
      const consentToken = tokenWith({ exp: inOneHour(), sub: 'CR-1' });
      hieHttpRequests.sendPostRequest.mockResolvedValue(
        upstreamResponse({ consent_token: consentToken, visit_id: 'v-1' }),
      );

      const result = await service.verifyConsent('c-1', {
        otp: '123456',
        otpRecord: 'otp-1',
        crId: 'CR-1',
        locationUuid: 'loc-1',
      });

      expect(hieHttpRequests.sendPostRequest).toHaveBeenCalledWith(
        `${BASE_URL}/shr/consents/c-1/verify`,
        { otp: '123456', otp_record: 'otp-1' },
        'loc-1',
        undefined,
      );
      expect(consentSessionStore.recordIssuedToken).toHaveBeenCalledWith({
        crId: 'CR-1',
        locationUuid: 'loc-1',
        visitId: 'v-1',
        consentToken,
        consentId: 'c-1',
      });
      expect(result).toEqual({ consent_token: consentToken, visit_id: 'v-1' });
    });

    it("falls back to the token's sub claim when the caller sent no crId", async () => {
      const consentToken = tokenWith({ sub: 'CR0824441219329-5' });
      hieHttpRequests.sendPostRequest.mockResolvedValue(
        upstreamResponse({ consent_token: consentToken, visit_id: 'v-1' }),
      );

      await service.verifyConsent('c-1', {
        otp: '123456',
        otpRecord: 'otp-1',
        locationUuid: 'loc-1',
      });

      expect(consentSessionStore.recordIssuedToken).toHaveBeenCalledWith(
        expect.objectContaining({ crId: 'CR0824441219329-5' }),
      );
    });

    it('still returns the approval when there is no crId to record it against', async () => {
      hieHttpRequests.sendPostRequest.mockResolvedValue(
        upstreamResponse({ consent_token: 'opaque-token', visit_id: 'v-1' }),
      );

      const result = await service.verifyConsent('c-1', {
        otp: '123456',
        otpRecord: 'otp-1',
        locationUuid: 'loc-1',
      });

      expect(consentSessionStore.recordIssuedToken).not.toHaveBeenCalled();
      expect(result.consent_token).toBe('opaque-token');
    });

    it('forwards a rejection with no otp, and records no session since no token is issued', async () => {
      hieHttpRequests.sendPostRequest.mockResolvedValue(
        upstreamResponse({
          consent_id: 'c-1',
          consent_status: 'Rejected',
          message: 'Consent has been rejected',
        }),
      );

      const result = await service.verifyConsent('c-1', {
        otpRecord: 'otp-1',
        consentDecision: ShrConsentDecision.Reject,
        rejectionReason: 'Patient denied consent',
        locationUuid: 'loc-1',
      });

      // A patient who declines never hands over a password, so `otp` must not
      // be invented to satisfy the shape.
      expect(hieHttpRequests.sendPostRequest).toHaveBeenCalledWith(
        `${BASE_URL}/shr/consents/c-1/verify`,
        {
          otp_record: 'otp-1',
          consent_decision: 'Reject',
          rejection_reason: 'Patient denied consent',
        },
        'loc-1',
        undefined,
      );
      expect(consentSessionStore.recordIssuedToken).not.toHaveBeenCalled();
      expect(result.consent_status).toBe('Rejected');
    });

    it('closes the local session when the verification completed an OTP-gated closure', async () => {
      hieHttpRequests.sendPostRequest.mockResolvedValue(
        upstreamResponse({
          consent_id: 'c-1',
          end_date: '2026-07-15',
          visit_id: 'v-1',
        }),
      );

      await service.verifyConsent('c-1', {
        otp: '123456',
        otpRecord: 'closure-otp-1',
        locationUuid: 'loc-1',
      });

      expect(consentSessionStore.markClosedByVisit).toHaveBeenCalledWith('v-1');
    });
  });

  describe('closeVisit', () => {
    it('sends an empty body and does not close the local session on an OTP-gated closure', async () => {
      hieHttpRequests.sendPostRequest.mockResolvedValue(
        upstreamResponse({
          consent_id: 'c-1',
          otp_record: '9fh38gd21k',
          visit_id: 'v-1',
        }),
      );

      await service.closeVisit('v-1', 'loc-1', { locationUuid: 'loc-1' });

      expect(hieHttpRequests.sendPostRequest).toHaveBeenCalledWith(
        `${BASE_URL}/shr/visits/v-1/close`,
        {},
        'loc-1',
        undefined,
      );
      // The visit stays open until that password is verified.
      expect(consentSessionStore.markClosedByVisit).not.toHaveBeenCalled();
    });

    it('forwards patient_incapable and closes the local session on an immediate closure', async () => {
      hieHttpRequests.sendPostRequest.mockResolvedValue(
        upstreamResponse({
          consent_id: 'c-1',
          end_date: '2026-07-15',
          visit_id: 'v-1',
        }),
      );

      await service.closeVisit('v-1', 'loc-1', {
        patientIncapable: ShrFlag.Yes,
        incapacityReason: 'Unconscious',
        locationUuid: 'loc-1',
      });

      expect(hieHttpRequests.sendPostRequest).toHaveBeenCalledWith(
        `${BASE_URL}/shr/visits/v-1/close`,
        { patient_incapable: 1, incapacity_reason: 'Unconscious' },
        'loc-1',
        undefined,
      );
      expect(consentSessionStore.markClosedByVisit).toHaveBeenCalledWith('v-1');
    });
  });

  describe('listOpenVisits', () => {
    it('sends the CR id as patient_id and the resolved facility code', async () => {
      locationFacilityHelper.getFacilityUsingLocationUuid.mockResolvedValue({
        frCode: 'FID-123',
      });
      hieHttpRequests.sendGetRequest.mockResolvedValue(
        upstreamResponse({ visits: [{ visit_id: 'v-1' }] }),
      );

      const result = await service.listOpenVisits({
        crId: 'CR-1',
        locationUuid: 'loc-1',
      });

      expect(hieHttpRequests.sendGetRequest).toHaveBeenCalledWith(
        `${BASE_URL}/shr/open-visits?patient_id=CR-1&facility_id=FID-123`,
        'loc-1',
        undefined,
      );
      expect(result.visits).toEqual([{ visit_id: 'v-1' }]);
    });
  });

  describe('getActiveConsent', () => {
    it('hands back the local token when it says it is still valid', async () => {
      const expiresAt = new Date(Date.now() + 3_600_000);
      consentSessionStore.findOpenSession.mockResolvedValue({
        visitId: 'v-1',
        consentId: 'c-1',
        consentToken: 'tok-1',
        tokenExpiresAt: expiresAt,
      });

      const result = await service.getActiveConsent({
        crId: 'CR-1',
        locationUuid: 'loc-1',
      });

      expect(result).toEqual({
        hasActiveConsent: true,
        message: 'Active consent found',
        source: ShrActiveConsentSource.Local,
        visitId: 'v-1',
        consentId: 'c-1',
        consentToken: 'tok-1',
        tokenExpiresAt: expiresAt.toISOString(),
      });
      expect(hieHttpRequests.sendPostRequest).not.toHaveBeenCalled();
      expect(hieHttpRequests.sendGetRequest).not.toHaveBeenCalled();
    });

    it('refreshes the local session when its token cannot be shown to be valid', async () => {
      // No exp claim, so staleness is unknowable — refresh rather than guess.
      consentSessionStore.findOpenSession.mockResolvedValue({
        visitId: 'v-1',
        consentId: 'c-1',
        consentToken: 'tok-1',
        tokenExpiresAt: null,
      });
      hieHttpRequests.sendPostRequest.mockResolvedValue(
        upstreamResponse({ consent_token: 'tok-2' }),
      );

      const result = await service.getActiveConsent({
        crId: 'CR-1',
        locationUuid: 'loc-1',
      });

      expect(hieHttpRequests.sendPostRequest).toHaveBeenCalledWith(
        `${BASE_URL}/shr/visits/v-1/refresh`,
        {},
        'loc-1',
        { [CONSENT_TOKEN_HEADER]: 'tok-1' },
      );
      expect(result).toMatchObject({
        hasActiveConsent: true,
        source: ShrActiveConsentSource.Refreshed,
        visitId: 'v-1',
        consentToken: 'tok-2',
      });
    });

    it('closes a local session DHA will no longer refresh and falls back to open visits', async () => {
      consentSessionStore.findOpenSession.mockResolvedValue({
        visitId: 'v-stale',
        consentId: 'c-1',
        consentToken: 'tok-1',
        tokenExpiresAt: null,
      });
      locationFacilityHelper.getFacilityUsingLocationUuid.mockResolvedValue({
        frCode: 'FID-123',
      });
      hieHttpRequests.sendPostRequest
        .mockResolvedValueOnce(
          upstreamResponse({ message: 'visit is closed' }, false, 400),
        )
        .mockResolvedValueOnce(upstreamResponse({ consent_token: 'tok-3' }));
      hieHttpRequests.sendGetRequest.mockResolvedValue(
        upstreamResponse({ visits: [{ visit_id: 'v-2' }] }),
      );

      const result = await service.getActiveConsent({
        crId: 'CR-1',
        locationUuid: 'loc-1',
      });

      expect(consentSessionStore.markClosedByVisit).toHaveBeenCalledWith(
        'v-stale',
      );
      // Reconstructed from open-visits, which carries no consent id.
      expect(consentSessionStore.recordIssuedToken).toHaveBeenCalledWith({
        crId: 'CR-1',
        locationUuid: 'loc-1',
        visitId: 'v-2',
        consentToken: 'tok-3',
      });
      expect(result).toMatchObject({
        hasActiveConsent: true,
        source: ShrActiveConsentSource.OpenVisits,
        visitId: 'v-2',
        consentId: null,
        consentToken: 'tok-3',
      });
    });

    it('reports no active consent when DHA lists no open visit', async () => {
      consentSessionStore.findOpenSession.mockResolvedValue(null);
      locationFacilityHelper.getFacilityUsingLocationUuid.mockResolvedValue({
        frCode: 'FID-123',
      });
      hieHttpRequests.sendGetRequest.mockResolvedValue(
        upstreamResponse({ visits: [] }),
      );

      const result = await service.getActiveConsent({
        crId: 'CR-1',
        locationUuid: 'loc-1',
      });

      expect(result.hasActiveConsent).toBe(false);
      expect(result.consentToken).toBeUndefined();
    });
  });

  it('sends the consent token header and returns the bundle unchanged', async () => {
    const bundle = { resourceType: 'Bundle', type: 'searchset', entry: [] };
    hieHttpRequests.sendGetRequest.mockResolvedValue(upstreamResponse(bundle));

    const result = await service.fetchPatientRecords(
      {
        crId: 'CR-1',
        resources: 'Observation,Condition',
        pageToken: 'page-2',
        locationUuid: 'loc-1',
      },
      'HWR-9',
      'tok-1',
    );

    expect(hieHttpRequests.sendGetRequest).toHaveBeenCalledWith(
      `${BASE_URL}/shr/patient-records?cr_id=CR-1&practitioner_id=HWR-9&resources=Observation%2CCondition&page_token=page-2`,
      'loc-1',
      { [CONSENT_TOKEN_HEADER]: 'tok-1' },
    );
    expect(result).toEqual(bundle);
  });

  it('surfaces upstream errors as HttpException with the upstream status', async () => {
    hieHttpRequests.sendGetRequest.mockResolvedValue(
      upstreamResponse({ message: 'consent token expired' }, false, 403),
    );

    await expect(
      service.fetchPatientRecords(
        { crId: 'CR-1', resources: 'Observation', locationUuid: 'loc-1' },
        'HWR-9',
        'tok-1',
      ),
    ).rejects.toMatchObject({
      status: 403,
      message: 'consent token expired',
    });
  });

  it('forwards the current token when refreshing an open visit and stores the new one', async () => {
    hieHttpRequests.sendPostRequest.mockResolvedValue(
      upstreamResponse({ consent_token: 'tok-2' }),
    );

    await service.refreshVisitConsent('v-1', 'loc-1', 'tok-1');

    expect(hieHttpRequests.sendPostRequest).toHaveBeenCalledWith(
      `${BASE_URL}/shr/visits/v-1/refresh`,
      {},
      'loc-1',
      { [CONSENT_TOKEN_HEADER]: 'tok-1' },
    );
    expect(consentSessionStore.recordRefreshedToken).toHaveBeenCalledWith(
      'v-1',
      'tok-2',
    );
  });

  it('forwards the bundle and consent token header when submitting a bundle', async () => {
    const bundle = {
      id: 'bundle-1',
      resourceType: 'Bundle' as const,
      type: 'collection' as const,
      entry: [{ resource: { resourceType: 'Encounter', id: 'enc-1' } }],
    };
    hieHttpRequests.sendPostRequest.mockResolvedValue(
      upstreamResponse({
        mediator_id: 'med-1',
        message: 'accepted',
        status: 'success',
      }),
    );

    const result = await service.submitBundle(bundle, 'loc-1', 'tok-1');

    expect(hieHttpRequests.sendPostRequest).toHaveBeenCalledWith(
      `${BASE_URL}/shr/bundles`,
      bundle,
      'loc-1',
      { [CONSENT_TOKEN_HEADER]: 'tok-1' },
    );
    expect(result).toEqual({
      mediator_id: 'med-1',
      message: 'accepted',
      status: 'success',
    });
  });

  it('surfaces upstream errors when submitting a bundle', async () => {
    hieHttpRequests.sendPostRequest.mockResolvedValue(
      upstreamResponse({ message: 'invalid bundle' }, false, 400),
    );

    await expect(
      service.submitBundle(
        {
          id: 'bundle-2',
          resourceType: 'Bundle' as const,
          type: 'collection' as const,
          entry: [],
        },
        'loc-1',
        'tok-1',
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: 'invalid bundle',
    });
  });

  it('only sends the resource label filters that were supplied', async () => {
    hieHttpRequests.sendGetRequest.mockResolvedValue(upstreamResponse({}));

    await service.fetchResourceLabels({
      resourceName: 'Observation',
      locationUuid: 'loc-1',
    });

    expect(hieHttpRequests.sendGetRequest).toHaveBeenCalledWith(
      `${BASE_URL}/shr/resource-labels?resource_name=Observation`,
      'loc-1',
      undefined,
    );
  });
});
