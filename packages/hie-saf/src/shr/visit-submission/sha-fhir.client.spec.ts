/**
 * ShaFhirClient tests — the $validate pre-flight (the only direct SHA FHIR
 * interaction; submission rides DHA's middleware via ShrService.submitBundle),
 * auth (static bearer + cached OAuth2), and the classification of the known
 * UAT terminology defect.
 */

import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { isKnownTerminologyDefect, ShaFhirClient } from './sha-fhir.client';
import type { FhirBundle } from './types';
import { jsonResponse } from './shr-visit-submission.fixture';

/** A four-issue outcome: the two real errors plus two known-defect errors. */
const OPERATION_OUTCOME = {
  resourceType: 'OperationOutcome',
  issue: [
    {
      severity: 'error',
      diagnostics: 'Bundle.entry[0]: Resource Patient has no id',
    },
    { severity: 'warning', diagnostics: 'A best-practice warning' },
    {
      severity: 'error',
      diagnostics:
        'None of the codings provided are in the value set http://…/ValueSet/em-clinical-acuity',
    },
    {
      severity: 'error',
      diagnostics:
        'No codes in ValueSet belong to CodeSystem http://…/CodeSystem/em-incident-type',
    },
  ],
};

/** ConfigService fake serving a plain key → value map. */
function configService(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const DEFAULTS = {
  SHA_FHIR_BASE_URL: 'https://sha.test/fhir',
  SHA_FHIR_BEARER_TOKEN: 'sha-static-token',
};

function bundleFixture(): FhirBundle {
  return {
    resourceType: 'Bundle',
    id: 'bundle-1',
    type: 'collection',
    entry: [],
  };
}

/** fetch fake that records every call and routes by URL. */
function recordingFetch(
  routes: Array<{
    match: (url: string) => boolean;
    respond: () => Response;
  }>,
) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const route = routes.find((candidate) => candidate.match(url));
    if (!route) {
      return Promise.resolve(
        jsonResponse(404, {
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', diagnostics: `no route for ${url}` }],
        }),
      );
    }
    return Promise.resolve(route.respond());
  };
  return { fetchImpl, calls };
}

describe('isKnownTerminologyDefect', () => {
  it('recognizes both documented UAT defect phrasings', () => {
    expect(
      isKnownTerminologyDefect(
        'None of the codings provided are in the value set …',
      ),
    ).toBe(true);
    expect(
      isKnownTerminologyDefect('No codes in ValueSet belong to CodeSystem …'),
    ).toBe(true);
    expect(isKnownTerminologyDefect('Resource Patient has no id')).toBe(false);
    expect(isKnownTerminologyDefect(undefined)).toBe(false);
  });
});

describe('ShaFhirClient.validateBundle', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('POSTs to [base]/Bundle/$validate with fhir+json and the static bearer token', async () => {
    const { fetchImpl, calls } = recordingFetch([
      {
        match: (url) => url.endsWith('/Bundle/$validate'),
        respond: () => jsonResponse(200, OPERATION_OUTCOME),
      },
    ]);
    jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);
    const client = new ShaFhirClient(configService(DEFAULTS));
    const outcome = await client.validateBundle(bundleFixture());

    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe('https://sha.test/fhir/Bundle/$validate');
    expect(
      (calls[0].init?.headers as Record<string, string>)['Content-Type'],
    ).toBe('application/fhir+json');
    expect(
      (calls[0].init?.headers as Record<string, string>).Authorization,
    ).toBe('Bearer sha-static-token');
    expect(outcome.httpStatus).toBe(200);
    expect(outcome.issues.length).toBe(4);
    // The defect issues are flagged…
    expect(
      outcome.issues.filter((issue) => issue.knownTerminologyDefect).length,
    ).toBe(2);
    // …and therefore non-blocking in the default (non-strict) mode — only the
    // real error remains, so validation still fails overall.
    expect(outcome.blockingIssues.length).toBe(1);
    expect(outcome.ok).toBe(false);
  });

  it('blocks on the terminology defect too when SHA_FHIR_PREVALIDATE_STRICT=true', async () => {
    const { fetchImpl } = recordingFetch([
      {
        match: (url) => url.endsWith('/Bundle/$validate'),
        respond: () => jsonResponse(200, OPERATION_OUTCOME),
      },
    ]);
    jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);
    const client = new ShaFhirClient(
      configService({ ...DEFAULTS, SHA_FHIR_PREVALIDATE_STRICT: 'true' }),
    );
    const outcome = await client.validateBundle(bundleFixture());
    expect(outcome.blockingIssues.length).toBe(3);
    expect(outcome.ok).toBe(false);
  });

  it('is ok when only known-defect issues remain', async () => {
    const defectOnly = {
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          diagnostics: 'No codes in ValueSet belong to CodeSystem http://…',
        },
      ],
    };
    const { fetchImpl } = recordingFetch([
      {
        match: (url) => url.endsWith('/Bundle/$validate'),
        respond: () => jsonResponse(200, defectOnly),
      },
    ]);
    jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);
    const client = new ShaFhirClient(configService(DEFAULTS));
    const outcome = await client.validateBundle(bundleFixture());
    expect(outcome.ok).toBe(true);
    expect(outcome.blockingIssues.length).toBe(0);
  });

  it('returns ok when the outcome carries no error-severity issues', async () => {
    const clean = {
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'information', diagnostics: 'All OK' }],
    };
    const { fetchImpl } = recordingFetch([
      {
        match: (url) => url.endsWith('/Bundle/$validate'),
        respond: () => jsonResponse(200, clean),
      },
    ]);
    jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);
    const client = new ShaFhirClient(configService(DEFAULTS));
    expect((await client.validateBundle(bundleFixture())).ok).toBe(true);
  });

  it('is ok on a 2xx with a non-OperationOutcome body (e.g. an HTML page)', async () => {
    const { fetchImpl } = recordingFetch([
      {
        match: (url) => url.endsWith('/Bundle/$validate'),
        respond: () => new Response('<html>ok</html>', { status: 200 }),
      },
    ]);
    jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);
    const client = new ShaFhirClient(configService(DEFAULTS));
    const outcome = await client.validateBundle(bundleFixture());
    expect(outcome.ok).toBe(true);
    expect(outcome.issues).toEqual([]);
  });

  it('throws a 502 HttpException when the request itself fails', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is down'));
    const client = new ShaFhirClient(configService(DEFAULTS));
    await expect(client.validateBundle(bundleFixture())).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('refuses to validate when no SHA FHIR base is configured', async () => {
    const client = new ShaFhirClient(configService({}));
    await expect(client.validateBundle(bundleFixture())).rejects.toThrow(
      /SHA_FHIR_BASE_URL/,
    );
  });
});

describe('ShaFhirClient OAuth2', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function oauthSetup() {
    const tokenRequests: string[] = [];
    const { fetchImpl, calls } = recordingFetch([
      {
        match: (url) => url === 'https://auth.test/token',
        respond: () => {
          tokenRequests.push('hit');
          return jsonResponse(200, {
            access_token: `tok-${tokenRequests.length}`,
            expires_in: 3600,
          });
        },
      },
      {
        match: (url) => url.endsWith('/Bundle/$validate'),
        respond: () => jsonResponse(200, OPERATION_OUTCOME),
      },
    ]);
    const client = new ShaFhirClient(
      configService({
        SHA_FHIR_BASE_URL: 'https://sha.test/fhir',
        SHA_FHIR_OAUTH_TOKEN_URL: 'https://auth.test/token',
        SHA_FHIR_OAUTH_CLIENT_ID: 'client-1',
        SHA_FHIR_OAUTH_CLIENT_SECRET: 'secret-1',
      }),
    );
    return { client, calls, fetchImpl, tokenRequests };
  }

  it('requests a client-credentials token and uses it on the $validate POST', async () => {
    const { client, calls, fetchImpl, tokenRequests } = oauthSetup();
    jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);
    await client.validateBundle(bundleFixture());
    expect(tokenRequests.length).toBe(1);
    expect(
      (
        calls.find((call) => call.url.endsWith('/Bundle/$validate'))?.init
          ?.headers as Record<string, string>
      ).Authorization,
    ).toBe('Bearer tok-1');
    const tokenCall = calls.find(
      (call) => call.url === 'https://auth.test/token',
    )!;
    const tokenBody = tokenCall.init?.body as URLSearchParams;
    expect(tokenBody.toString()).toMatch(/grant_type=client_credentials/);
    expect(tokenBody.toString()).toMatch(/client_id=client-1/);
  });

  it('caches the token across validations', async () => {
    const { client, fetchImpl, tokenRequests } = oauthSetup();
    jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);
    await client.validateBundle(bundleFixture());
    await client.validateBundle(bundleFixture());
    expect(tokenRequests.length).toBe(1);
  });

  it('throws a descriptive error when the token endpoint fails', async () => {
    const { fetchImpl } = recordingFetch([
      {
        match: (url) => url === 'https://auth.test/token',
        respond: () => jsonResponse(401, { error: 'invalid_client' }),
      },
    ]);
    jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);
    const client = new ShaFhirClient(
      configService({
        SHA_FHIR_BASE_URL: 'https://sha.test/fhir',
        SHA_FHIR_OAUTH_TOKEN_URL: 'https://auth.test/token',
        SHA_FHIR_OAUTH_CLIENT_ID: 'client-1',
        SHA_FHIR_OAUTH_CLIENT_SECRET: 'wrong',
      }),
    );
    await expect(client.validateBundle(bundleFixture())).rejects.toThrow(
      /OAuth2 token request failed \(401\)/,
    );
  });
});
