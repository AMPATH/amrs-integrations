import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { HieHttpRequests } from '../hie-http-request/hie-http-requests';
import { LocationFacilityHelper } from '../shared/utils/location-facility.helper';
import { CONSENT_TOKEN_HEADER, ShrService } from './shr.service';
import { ShrVisitType } from './types';

const BASE_URL = 'https://ilm-dev.dha.go.ke/uat-middleware/api/v1';

const upstreamResponse = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  text: () => Promise.resolve(JSON.stringify(body)),
});

describe('ShrService', () => {
  let service: ShrService;
  const hieHttpRequests = {
    sendGetRequest: jest.fn(),
    sendPostRequest: jest.fn(),
  };
  const configService = { get: jest.fn() };
  const locationFacilityHelper = { getFacilityUsingLocationUuid: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    configService.get.mockReturnValue(BASE_URL);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShrService,
        { provide: HieHttpRequests, useValue: hieHttpRequests },
        { provide: ConfigService, useValue: configService },
        { provide: LocationFacilityHelper, useValue: locationFacilityHelper },
      ],
    }).compile();

    service = module.get<ShrService>(ShrService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('resolves facility_id from the location when requesting consent', async () => {
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

  it('maps the otp record to snake_case when verifying consent', async () => {
    hieHttpRequests.sendPostRequest.mockResolvedValue(
      upstreamResponse({ consent_token: 'tok-1', visit_id: 'v-1' }),
    );

    const result = await service.verifyConsent('c-1', {
      otp: '123456',
      otpRecord: 'otp-1',
      locationUuid: 'loc-1',
    });

    expect(hieHttpRequests.sendPostRequest).toHaveBeenCalledWith(
      `${BASE_URL}/shr/consents/c-1/verify`,
      { otp: '123456', otp_record: 'otp-1' },
      'loc-1',
      undefined,
    );
    expect(result).toEqual({ consent_token: 'tok-1', visit_id: 'v-1' });
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

  it('forwards the current token when refreshing an open visit', async () => {
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
