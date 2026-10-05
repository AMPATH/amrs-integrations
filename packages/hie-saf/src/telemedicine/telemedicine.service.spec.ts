/**
 * TelemedicineService tests — the broker workflow with every dependency mocked
 * at its boundary (facility helper, ConfigService, global fetch): the 503 when
 * the deployment has no Livia configuration, the facility/frCode resolution
 * from the location UUID, the request Livia receives (credentials in headers,
 * facility code + practitioner national ID in the body), the verbatim
 * passthrough of a minted token, and every failure mapping (upstream HTTP,
 * application-level code, network error).
 */

import { ConfigService } from '@nestjs/config';
import { BadRequestException, HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LocationFacilityHelper } from '../shared/utils/location-facility.helper';
import { TelemedicineService } from './telemedicine.service';
import { RequestTelemedicineSessionDto } from './dto/request-telemedicine-session.dto';
import { RequestPatientTelemedicineSessionDto } from './dto/request-patient-telemedicine-session.dto';

const LOCATION_UUID = '18c343eb-b353-462a-9139-b16606e6b6c2';

/** The request body, as the controller would hand it over (already validated). */
function dtoFor(
  overrides: Partial<RequestTelemedicineSessionDto> = {},
): RequestTelemedicineSessionDto {
  return {
    nationalId: '10000000003',
    locationUuid: LOCATION_UUID,
    ...overrides,
  };
}

/** The patient-chart request body, as the controller would hand it over. */
function patientDtoFor(
  overrides: Partial<RequestPatientTelemedicineSessionDto> = {},
): RequestPatientTelemedicineSessionDto {
  return {
    doctorNationalId: '10000000003',
    patientNationalId: '87654321',
    locationUuid: LOCATION_UUID,
    ...overrides,
  };
}

/** A fetch fake that records every call and answers from a status/body pair. */
function recordingFetch(responses: Array<{ status: number; body: string }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const next = responses.shift() ?? { status: 500, body: '' };
    return Promise.resolve({
      ok: next.status < 400,
      status: next.status,
      text: () => Promise.resolve(next.body),
    } as Response);
  };
  return { fetchImpl, calls };
}

describe('TelemedicineService', () => {
  let service: TelemedicineService;
  let getFacilityUsingLocationUuid: jest.Mock;
  let env: Record<string, string>;

  // Compiled per test — the service snapshots its config in the constructor,
  // so the env must be in place before the testing module builds.
  async function compileService() {
    const module = await Test.createTestingModule({
      providers: [
        TelemedicineService,
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
    service = module.get(TelemedicineService);
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    getFacilityUsingLocationUuid = jest.fn();
    env = {
      LIVIA_SSO_BASE_URL: 'https://api.liviaapp.net',
      LIVIA_SSO_USERNAME: 'health-center',
      LIVIA_SSO_PASSWORD: 'secret',
    };
    await compileService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('POSTs the credentials and facility code to Livia and passes the minted token back verbatim', async () => {
    getFacilityUsingLocationUuid.mockResolvedValueOnce({
      frCode: 'FID-27-114387-5',
      facilityName: 'AMPATH',
    });
    const livia = {
      code: 200,
      expires_in: 600,
      redirect_url: 'https://md-uat.liviaapp.net/#/sso?token=t0k3n',
    };
    const { fetchImpl, calls } = recordingFetch([
      { status: 200, body: JSON.stringify(livia) },
    ]);
    jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);

    const response = await service.requestSsoToken(dtoFor());

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.liviaapp.net/api/partner/sso/token');
    expect(calls[0].init?.method).toBe('POST');
    expect(new Headers(calls[0].init?.headers).get('username')).toBe(
      'health-center',
    );
    expect(new Headers(calls[0].init?.headers).get('password')).toBe('secret');
    expect(
      JSON.parse(
        typeof calls[0].init?.body === 'string' ? calls[0].init.body : '',
      ),
    ).toEqual({
      facility_code: 'FID-27-114387-5',
      national_id: '10000000003',
    });
    // Livia's answer goes back to the caller untouched.
    expect(response).toEqual(livia);
  });

  it('answers 503 when the deployment has no Livia configuration', async () => {
    env = {};
    await compileService();

    await expect(service.requestSsoToken(dtoFor())).rejects.toMatchObject({
      status: 503,
      message: 'Telemedicine SSO is not configured on this deployment.',
    });
    expect(getFacilityUsingLocationUuid).not.toHaveBeenCalled();
  });

  it('answers 400 when the location has no facility record', async () => {
    getFacilityUsingLocationUuid.mockResolvedValueOnce(null);

    await expect(service.requestSsoToken(dtoFor())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(getFacilityUsingLocationUuid).toHaveBeenCalledWith(LOCATION_UUID);
  });

  it('answers 400 when the facility has no FR code', async () => {
    getFacilityUsingLocationUuid.mockResolvedValueOnce({
      frCode: null,
      facilityName: 'AMPATH',
    });

    await expect(service.requestSsoToken(dtoFor())).rejects.toMatchObject({
      status: 400,
      message: 'Missing facility code',
    });
  });

  it('maps an upstream HTTP failure to a 502', async () => {
    getFacilityUsingLocationUuid.mockResolvedValueOnce({
      frCode: 'FID-27-114387-5',
    });
    const { fetchImpl } = recordingFetch([{ status: 500, body: 'boom' }]);
    jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);

    await expect(service.requestSsoToken(dtoFor())).rejects.toMatchObject({
      status: 502,
      message: 'Livia SSO token request failed (500).',
    });
  });

  it('maps an application-level rejection (HTTP 200, code != 200) to a 502 with Livia’s message', async () => {
    getFacilityUsingLocationUuid.mockResolvedValueOnce({
      frCode: 'FID-27-114387-5',
    });
    const { fetchImpl } = recordingFetch([
      {
        status: 200,
        body: JSON.stringify({ code: 401, message: 'Invalid credentials' }),
      },
    ]);
    jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);

    await expect(service.requestSsoToken(dtoFor())).rejects.toMatchObject({
      status: 502,
      message: 'Invalid credentials',
    });
  });

  it('maps a network failure to a 500 carrying the cause', async () => {
    getFacilityUsingLocationUuid.mockResolvedValueOnce({
      frCode: 'FID-27-114387-5',
    });
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new TypeError('fetch failed'));

    // One call, inspected twice — a second call would miss the one-shot mock
    // and hit the real network.
    const promise = service.requestSsoToken(dtoFor());
    await expect(promise).rejects.toBeInstanceOf(HttpException);
    await expect(promise).rejects.toMatchObject({ status: 500 });
  });
});

describe('TelemedicineService — patient sessions', () => {
  let service: TelemedicineService;
  let getFacilityUsingLocationUuid: jest.Mock;
  let env: Record<string, string>;

  // Compiled per test — the service snapshots its config in the constructor,
  // so the env must be in place before the testing module builds.
  async function compileService() {
    const module = await Test.createTestingModule({
      providers: [
        TelemedicineService,
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
    service = module.get(TelemedicineService);
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    getFacilityUsingLocationUuid = jest.fn();
    env = {
      LIVIA_SSO_BASE_URL: 'https://api.liviaapp.net',
      LIVIA_SSO_USERNAME: 'health-center',
      LIVIA_SSO_PASSWORD: 'secret',
    };
    await compileService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('POSTs both national IDs and the consent token to the patient SSO endpoint', async () => {
    getFacilityUsingLocationUuid.mockResolvedValueOnce({
      frCode: 'FID-27-114387-5',
    });
    const livia = {
      code: 200,
      expires_in: 600,
      redirect_url: 'https://md-uat.liviaapp.net/#/sso?token=p4713n7',
    };
    const { fetchImpl, calls } = recordingFetch([
      { status: 200, body: JSON.stringify(livia) },
    ]);
    jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);

    const response = await service.requestPatientSsoToken(
      patientDtoFor({ consentToken: 'abc123' }),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      'https://api.liviaapp.net/api/partner/sso/patient-token',
    );
    expect(calls[0].init?.method).toBe('POST');
    expect(new Headers(calls[0].init?.headers).get('username')).toBe(
      'health-center',
    );
    expect(new Headers(calls[0].init?.headers).get('password')).toBe('secret');
    expect(
      JSON.parse(
        typeof calls[0].init?.body === 'string' ? calls[0].init.body : '',
      ),
    ).toEqual({
      facility_code: 'FID-27-114387-5',
      doctor_national_id: '10000000003',
      patient_national_id: '87654321',
      consent_token: 'abc123',
    });
    expect(response).toEqual(livia);
  });

  it('omits the consent token entirely when there is none', async () => {
    getFacilityUsingLocationUuid.mockResolvedValueOnce({
      frCode: 'FID-27-114387-5',
    });
    const { fetchImpl, calls } = recordingFetch([
      {
        status: 200,
        body: JSON.stringify({ code: 200, expires_in: 600, redirect_url: 'u' }),
      },
    ]);
    jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);

    await service.requestPatientSsoToken(patientDtoFor());

    const body = JSON.parse(
      typeof calls[0].init?.body === 'string' ? calls[0].init.body : '{}',
    );
    expect(body).toEqual({
      facility_code: 'FID-27-114387-5',
      doctor_national_id: '10000000003',
      patient_national_id: '87654321',
    });
  });

  it('answers 503 when the deployment has no Livia configuration', async () => {
    env = {};
    await compileService();

    await expect(
      service.requestPatientSsoToken(patientDtoFor()),
    ).rejects.toMatchObject({
      status: 503,
      message: 'Telemedicine SSO is not configured on this deployment.',
    });
    expect(getFacilityUsingLocationUuid).not.toHaveBeenCalled();
  });
});
