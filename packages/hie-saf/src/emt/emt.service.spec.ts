import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { validate } from 'class-validator';
import { HieHttpRequests } from '../hie-http-request/hie-http-requests';
import { PractitionerResolver } from '../shared/utils/practitioner-resolver.helper';
import { InitiateEmtHandoverDto } from './dto/initiate-emt-handover.dto';
import { ListEmtReferralsDto } from './dto/list-emt-referrals.dto';
import { VerifyEmtHandoverDto } from './dto/verify-emt-handover.dto';
import { EmtService } from './emt.service';
import { EmtErrorCode } from './types';

const BASE_URL = 'https://ilm-dev.dha.go.ke/uat-middleware';

const upstreamResponse = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  text: () => Promise.resolve(JSON.stringify(body)),
});

describe('EmtService', () => {
  let service: EmtService;
  const hieHttpRequests = {
    sendGetRequest: jest.fn(),
    sendPostRequest: jest.fn(),
  };
  const configService = { get: jest.fn() };
  const practitionerResolver = {
    resolveLoggedInPractitionerIdentity: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    configService.get.mockReturnValue(BASE_URL);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmtService,
        { provide: HieHttpRequests, useValue: hieHttpRequests },
        { provide: ConfigService, useValue: configService },
        { provide: PractitionerResolver, useValue: practitionerResolver },
      ],
    }).compile();

    service = module.get<EmtService>(EmtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listReferrals', () => {
    it('sends only the referral filters that were supplied', async () => {
      hieHttpRequests.sendGetRequest.mockResolvedValue(
        upstreamResponse({ results: [], count: 0, limit: 50, offset: 0 }),
      );

      await service.listReferrals({
        status: 'pending_acceptance',
        locationUuid: 'loc-1',
      });

      expect(hieHttpRequests.sendGetRequest).toHaveBeenCalledWith(
        `${BASE_URL}/api/v1/claims/emt/pending?status=pending_acceptance`,
        'loc-1',
      );
    });

    it('returns the parsed referrals envelope unchanged', async () => {
      const envelope = {
        results: [
          {
            submission_id: 3,
            cr_id: 'CR5617849204955-8',
            status: 'pending_acceptance',
            case_number: 'AMB-d22419d8-6d36-4b2f-a33c-3e008bd85f77-FAC',
            ambulance_fr_code: 'FID-AMB-916293-3',
            facility_fr_code: 'FID-47-108521-3',
            evacuation_scene: '',
            referral_reason: '',
            referral_category: '',
            transport_modality: '',
            referral_notes: 'string',
            bundle_id: 'd22419d8-6d36-4b2f-a33c-3e008bd85f77',
            interventions: ['SHA-01-001'],
            requested_at: '2026-08-04T09:37:39.438967Z',
            updated_at: '2026-08-04T09:37:40.428903Z',
          },
        ],
        count: 1,
        limit: 50,
        offset: 0,
      };
      hieHttpRequests.sendGetRequest.mockResolvedValue(
        upstreamResponse(envelope),
      );

      const result = await service.listReferrals({ locationUuid: 'loc-1' });

      expect(hieHttpRequests.sendGetRequest).toHaveBeenCalledWith(
        `${BASE_URL}/api/v1/claims/emt/pending`,
        'loc-1',
      );
      expect(result).toEqual(envelope);
    });

    it('normalizes an upstream 5xx as an upstream error', async () => {
      hieHttpRequests.sendGetRequest.mockResolvedValue(
        upstreamResponse({ message: 'internal error' }, false, 503),
      );

      await expect(
        service.listReferrals({ locationUuid: 'loc-1' }),
      ).rejects.toMatchObject({
        status: 503,
        response: { statusCode: 503, code: EmtErrorCode.UpstreamError },
      });
    });

    it('normalizes a network failure/timeout as an upstream error', async () => {
      hieHttpRequests.sendGetRequest.mockRejectedValue(
        new Error('fetch failed'),
      );

      await expect(
        service.listReferrals({ locationUuid: 'loc-1' }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_GATEWAY,
        response: { code: EmtErrorCode.UpstreamError },
      });
    });
  });

  describe('initiateHandover', () => {
    it('resolves the receiving practitioner server side and uses it for the payload', async () => {
      practitionerResolver.resolveLoggedInPractitionerIdentity.mockResolvedValue(
        {
          identifier: 'A13579',
          identifierType: 'registration_number',
          regulator: 'KMPDC',
        },
      );
      hieHttpRequests.sendPostRequest.mockResolvedValue(
        upstreamResponse({ request_id: 'req-1', status: 'pending' }),
      );

      const result = await service.initiateHandover(
        {
          incidenceNumber: 'AMB-d22419d8-6d36-4b2f-a33c-3e008bd85f77-FAC',
          locationUuid: 'loc-1',
        },
        'session-cookie-1',
      );

      expect(
        practitionerResolver.resolveLoggedInPractitionerIdentity,
      ).toHaveBeenCalledWith('session-cookie-1', 'loc-1');
      expect(hieHttpRequests.sendPostRequest).toHaveBeenCalledWith(
        `${BASE_URL}/api/v1/claims/emt/handover/initiate`,
        {
          incidence_number: 'AMB-d22419d8-6d36-4b2f-a33c-3e008bd85f77-FAC',
          identifier: 'A13579',
          identifier_type: 'registration_number',
          regulator: 'KMPDC',
        },
        'loc-1',
      );
      expect(result).toEqual({ request_id: 'req-1', status: 'pending' });
    });

    it('does not call the upstream API when the practitioner cannot be resolved', async () => {
      practitionerResolver.resolveLoggedInPractitionerIdentity.mockRejectedValue(
        new Error('no HWR record'),
      );

      await expect(
        service.initiateHandover(
          { incidenceNumber: 'AMB-1-FAC', locationUuid: 'loc-1' },
          'session-cookie-1',
        ),
      ).rejects.toThrow();
      expect(hieHttpRequests.sendPostRequest).not.toHaveBeenCalled();
    });

    it('normalizes an auth failure', async () => {
      practitionerResolver.resolveLoggedInPractitionerIdentity.mockResolvedValue(
        {
          identifier: 'A1',
          identifierType: 'registration_number',
          regulator: 'KMPDC',
        },
      );
      hieHttpRequests.sendPostRequest.mockResolvedValue(
        upstreamResponse({ message: 'invalid bearer token' }, false, 401),
      );

      await expect(
        service.initiateHandover(
          { incidenceNumber: 'AMB-1-FAC', locationUuid: 'loc-1' },
          'cookie',
        ),
      ).rejects.toMatchObject({
        status: 401,
        response: {
          code: EmtErrorCode.AuthFailure,
          message: 'invalid bearer token',
        },
      });
    });

    it('normalizes a conflict when the handover was already initiated', async () => {
      practitionerResolver.resolveLoggedInPractitionerIdentity.mockResolvedValue(
        {
          identifier: 'A1',
          identifierType: 'registration_number',
          regulator: 'KMPDC',
        },
      );
      hieHttpRequests.sendPostRequest.mockResolvedValue(
        upstreamResponse({ message: 'handover already initiated' }, false, 409),
      );

      await expect(
        service.initiateHandover(
          { incidenceNumber: 'AMB-1-FAC', locationUuid: 'loc-1' },
          'cookie',
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: EmtErrorCode.Conflict },
      });
    });

    it('normalizes a validation error', async () => {
      practitionerResolver.resolveLoggedInPractitionerIdentity.mockResolvedValue(
        {
          identifier: 'A1',
          identifierType: 'registration_number',
          regulator: 'KMPDC',
        },
      );
      hieHttpRequests.sendPostRequest.mockResolvedValue(
        upstreamResponse(
          { message: 'incidence_number is required' },
          false,
          400,
        ),
      );

      await expect(
        service.initiateHandover(
          { incidenceNumber: 'AMB-1-FAC', locationUuid: 'loc-1' },
          'cookie',
        ),
      ).rejects.toMatchObject({
        status: 400,
        response: { code: EmtErrorCode.ValidationError },
      });
    });

    it('distinguishes not-found from already-handled referrals', async () => {
      practitionerResolver.resolveLoggedInPractitionerIdentity.mockResolvedValue(
        {
          identifier: 'A1',
          identifierType: 'registration_number',
          regulator: 'KMPDC',
        },
      );
      hieHttpRequests.sendPostRequest.mockResolvedValue(
        upstreamResponse({ message: 'incidence number not found' }, false, 404),
      );

      await expect(
        service.initiateHandover(
          { incidenceNumber: 'AMB-1-FAC', locationUuid: 'loc-1' },
          'cookie',
        ),
      ).rejects.toMatchObject({
        status: 404,
        response: { code: EmtErrorCode.NotFound },
      });

      hieHttpRequests.sendPostRequest.mockResolvedValue(
        upstreamResponse({ message: 'referral already accepted' }, false, 404),
      );

      await expect(
        service.initiateHandover(
          { incidenceNumber: 'AMB-1-FAC', locationUuid: 'loc-1' },
          'cookie',
        ),
      ).rejects.toMatchObject({
        status: 404,
        response: { code: EmtErrorCode.AlreadyHandled },
      });
    });
  });

  describe('verifyHandover', () => {
    it('maps the verify payload to snake_case and posts it', async () => {
      hieHttpRequests.sendPostRequest.mockResolvedValue(
        upstreamResponse({ status: 'accepted' }),
      );

      const result = await service.verifyHandover({
        incidenceNumber: 'AMB-1-FAC',
        requestId: 'req-1',
        otp: '623415',
        locationUuid: 'loc-1',
      });

      expect(hieHttpRequests.sendPostRequest).toHaveBeenCalledWith(
        `${BASE_URL}/api/v1/claims/emt/handover/verify`,
        { incidence_number: 'AMB-1-FAC', request_id: 'req-1', otp: '623415' },
        'loc-1',
      );
      expect(result).toEqual({ status: 'accepted' });
    });

    it('normalizes an invalid otp', async () => {
      hieHttpRequests.sendPostRequest.mockResolvedValue(
        upstreamResponse({ message: 'invalid otp' }, false, 400),
      );

      await expect(
        service.verifyHandover({
          incidenceNumber: 'AMB-1-FAC',
          requestId: 'req-1',
          otp: '000000',
          locationUuid: 'loc-1',
        }),
      ).rejects.toMatchObject({
        status: 400,
        response: { code: EmtErrorCode.InvalidOtp },
      });
    });

    it('distinguishes an expired otp from an invalid otp', async () => {
      hieHttpRequests.sendPostRequest.mockResolvedValue(
        upstreamResponse({ message: 'otp expired' }, false, 400),
      );

      await expect(
        service.verifyHandover({
          incidenceNumber: 'AMB-1-FAC',
          requestId: 'req-1',
          otp: '000000',
          locationUuid: 'loc-1',
        }),
      ).rejects.toMatchObject({
        status: 400,
        response: { code: EmtErrorCode.OtpExpired },
      });
    });

    it('does not classify a non-otp validation error on verify as an otp error', async () => {
      hieHttpRequests.sendPostRequest.mockResolvedValue(
        upstreamResponse({ message: 'request_id is required' }, false, 400),
      );

      await expect(
        service.verifyHandover({
          incidenceNumber: 'AMB-1-FAC',
          requestId: 'req-1',
          otp: '000000',
          locationUuid: 'loc-1',
        }),
      ).rejects.toMatchObject({
        status: 400,
        response: { code: EmtErrorCode.ValidationError },
      });
    });
  });

  describe('DTO validation', () => {
    it('rejects ListEmtReferralsDto without locationUuid', async () => {
      const dto = Object.assign(new ListEmtReferralsDto(), {
        status: 'pending_acceptance',
      });

      const errors = await validate(dto);

      expect(errors.some((error) => error.property === 'locationUuid')).toBe(
        true,
      );
    });

    it('rejects InitiateEmtHandoverDto without locationUuid', async () => {
      const dto = Object.assign(new InitiateEmtHandoverDto(), {
        incidenceNumber: 'AMB-1-FAC',
      });

      const errors = await validate(dto);

      expect(errors.some((error) => error.property === 'locationUuid')).toBe(
        true,
      );
    });

    it('rejects VerifyEmtHandoverDto without locationUuid', async () => {
      const dto = Object.assign(new VerifyEmtHandoverDto(), {
        incidenceNumber: 'AMB-1-FAC',
        requestId: 'req-1',
        otp: '123456',
      });

      const errors = await validate(dto);

      expect(errors.some((error) => error.property === 'locationUuid')).toBe(
        true,
      );
    });
  });
});
