/**
 * OpenMrsVisitClient tests — the "latest closed visit" selection rules, the
 * custom representations actually requested, the ownership/closure guards, and
 * the patient-only encounter fallback. OpenMRS is reached on the caller's
 * JSESSIONID cookie, so that is what the specs assert — no service account.
 */

import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { OpenMrsVisitClient } from './openmrs-visit.client';
import type { OpenMrsVisit } from './types';
import {
  encounterFixture,
  jsonResponse,
  PATIENT_UUID,
  VISIT_UUID,
  visitFixture,
} from './shr-visit-submission.fixture';

/** ConfigService fake: AMRS_BASE_URL only, which is all the client reads. */
function configService(): ConfigService {
  return { get: () => 'openmrs.test' } as unknown as ConfigService;
}

/** global.fetch fake that records calls and serves canned REST responses. */
function openmrsFetch(
  routes: Array<{
    match: (url: string) => boolean;
    respond: (url: string) => unknown;
  }>,
) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const route = routes.find((candidate) => candidate.match(url));
    if (!route) {
      return Promise.resolve(
        jsonResponse(404, { error: `no test route for ${url}` }),
      );
    }
    return Promise.resolve(jsonResponse(200, route.respond(url)));
  };
  return { fetchImpl, calls };
}

function clientWith() {
  return new OpenMrsVisitClient(configService());
}

const SESSION_COOKIE = 'session-token-1';

describe('OpenMrsVisitClient auth + request shape', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends the caller’s JSESSIONID cookie and the custom patient rep', async () => {
    const { fetchImpl, calls } = openmrsFetch([
      {
        match: (url) => url.includes('/ws/rest/v1/patient/'),
        respond: () => ({ uuid: PATIENT_UUID, identifiers: [] }),
      },
    ]);
    jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);
    await clientWith().getPatient(PATIENT_UUID, SESSION_COOKIE);
    const init = calls[0].init!;
    expect((init.headers as Record<string, string>).cookie).toBe(
      `JSESSIONID=${SESSION_COOKIE}`,
    );
    expect(calls[0].url).toBe(
      `https://openmrs.test/openmrs/ws/rest/v1/patient/${PATIENT_UUID}?v=${
        (calls[0].url.match(/\?v=(.*)$/) ?? [])[1]
      }`,
    );
    expect(calls[0].url).toMatch(
      `https://openmrs.test/openmrs/ws/rest/v1/patient/${PATIENT_UUID}?v=custom:`,
    );
    // The patient rep must ask for identifiers WITH their types — the mapper
    // needs the type uuid to pick CR/UPI.
    expect(calls[0].url).toContain('identifierType:');
  });

  it('rejects the call without a session cookie', async () => {
    const { fetchImpl } = openmrsFetch([
      {
        match: (url) => url.includes('/ws/rest/v1/patient/'),
        respond: () => ({ uuid: PATIENT_UUID }),
      },
    ]);
    jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);
    await expect(
      clientWith().getPatient(PATIENT_UUID, ''),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps a patient 404 to NotFoundException', async () => {
    const fetchImpl = (): Promise<Response> =>
      Promise.resolve(jsonResponse(404, { error: 'not found' }));
    jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);
    await expect(
      clientWith().getPatient('missing-uuid', SESSION_COOKIE),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('OpenMrsVisitClient.getLatestClosedVisit', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function visitsFetch(visits: OpenMrsVisit[]) {
    return openmrsFetch([
      {
        match: (url) => url.includes('/ws/rest/v1/visit'),
        respond: () => ({ results: visits }),
      },
    ]);
  }

  it('requests includeInactive=true — the default hides exactly the closed visits we need', async () => {
    const { fetchImpl, calls } = visitsFetch([]);
    jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);
    await clientWith().getLatestClosedVisit(PATIENT_UUID, SESSION_COOKIE);
    expect(calls[0].url).toContain('includeInactive=true');
    expect(calls[0].url).toContain(`patient=${PATIENT_UUID}`);
  });

  it('picks the visit with the newest stopDatetime, ignoring still-open visits', async () => {
    const olderClosed = visitFixture({
      uuid: 'older-visit',
      stopDatetime: '2026-08-01T10:00:00+0300',
      startDatetime: '2026-08-01T09:00:00+0300',
    });
    const newerClosed = visitFixture({
      uuid: 'newer-visit',
      stopDatetime: '2026-09-01T11:30:00+0300',
    });
    const stillOpen = visitFixture({ uuid: 'open-visit', stopDatetime: null });
    const { fetchImpl } = visitsFetch([stillOpen, olderClosed, newerClosed]);
    jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);
    const latest = await clientWith().getLatestClosedVisit(
      PATIENT_UUID,
      SESSION_COOKIE,
    );
    expect(latest?.uuid).toBe('newer-visit');
  });

  it('returns null when no visit is closed (the "skipped" outcome)', async () => {
    const { fetchImpl } = visitsFetch([visitFixture({ stopDatetime: null })]);
    jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);
    expect(
      await clientWith().getLatestClosedVisit(PATIENT_UUID, SESSION_COOKIE),
    ).toBeNull();
  });

  it('filters on the location client-side when one is given', async () => {
    const elsewhere = visitFixture({
      uuid: 'elsewhere',
      location: { uuid: 'other-location', display: 'Elsewhere' },
    });
    const here = visitFixture({
      uuid: 'here',
      location: { uuid: 'location-1', display: 'AMRS Test Clinic' },
    });
    const { fetchImpl } = visitsFetch([elsewhere, here]);
    jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);
    const latest = await clientWith().getLatestClosedVisit(
      PATIENT_UUID,
      SESSION_COOKIE,
      'location-1',
    );
    expect(latest?.uuid).toBe('here');
  });
});

describe('OpenMrsVisitClient.getClosedVisit', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects a visit that belongs to another patient', async () => {
    const { fetchImpl } = openmrsFetch([
      {
        match: (url) => url.includes(`/ws/rest/v1/visit/${VISIT_UUID}`),
        respond: () => visitFixture({ patient: { uuid: 'someone-else' } }),
      },
    ]);
    jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);
    await expect(
      clientWith().getClosedVisit(PATIENT_UUID, VISIT_UUID, SESSION_COOKIE),
    ).rejects.toThrow(/belongs to a different patient/);
  });

  it('rejects a visit that is not closed (ConflictException → HTTP 409)', async () => {
    const { fetchImpl } = openmrsFetch([
      {
        match: (url) => url.includes(`/ws/rest/v1/visit/${VISIT_UUID}`),
        respond: () => visitFixture({ stopDatetime: null }),
      },
    ]);
    jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);
    await expect(
      clientWith().getClosedVisit(PATIENT_UUID, VISIT_UUID, SESSION_COOKIE),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('OpenMrsVisitClient.getVisitEncounters', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const inVisit = encounterFixture();
  const inOtherVisit = encounterFixture({
    uuid: 'enc-other',
    visit: { uuid: 'other-visit' },
  });

  it('queries with both patient and visit params, and drops voided encounters', async () => {
    const voided = encounterFixture({ uuid: 'enc-voided', voided: true });
    const { fetchImpl, calls } = openmrsFetch([
      {
        match: (url) => url.includes('/ws/rest/v1/encounter'),
        respond: () => ({ results: [inVisit, voided] }),
      },
    ]);
    jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);
    const encounters = await clientWith().getVisitEncounters(
      PATIENT_UUID,
      VISIT_UUID,
      SESSION_COOKIE,
    );
    expect(calls[0].url).toContain(`visit=${VISIT_UUID}`);
    expect(encounters.length).toBe(1);
    expect(encounters[0].uuid).toBe('encounter-1');
  });

  it('falls back to a patient-only query filtered client-side on visit.uuid', async () => {
    let firstCall = true;
    const { fetchImpl, calls } = openmrsFetch([
      {
        match: (url) => url.includes('/ws/rest/v1/encounter'),
        respond: () => {
          // First call (patient+visit) returns nothing — as if the visit param
          // were ignored — the fallback must then filter correctly.
          if (firstCall) {
            firstCall = false;
            return { results: [] };
          }
          return { results: [inVisit, inOtherVisit] };
        },
      },
    ]);
    jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);
    const encounters = await clientWith().getVisitEncounters(
      PATIENT_UUID,
      VISIT_UUID,
      SESSION_COOKIE,
    );
    expect(calls.length).toBe(2);
    expect(calls[1].url).not.toContain('visit=');
    expect(encounters.length).toBe(1);
    expect(encounters[0].uuid).toBe('encounter-1');
  });
});

describe('OpenMrsVisitClient.fetchClosedVisitContext', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('assembles patient + latest closed visit + encounters', async () => {
    const { fetchImpl } = openmrsFetch([
      {
        match: (url) => url.includes('/ws/rest/v1/patient/'),
        respond: () => ({ uuid: PATIENT_UUID, identifiers: [] }),
      },
      {
        match: (url) => url.includes('/ws/rest/v1/visit'),
        respond: () => ({ results: [visitFixture()] }),
      },
      {
        match: (url) => url.includes('/ws/rest/v1/encounter'),
        respond: () => ({ results: [encounterFixture()] }),
      },
    ]);
    jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);
    const context = await clientWith().fetchClosedVisitContext(
      PATIENT_UUID,
      SESSION_COOKIE,
    );
    expect(context.patient.uuid).toBe(PATIENT_UUID);
    expect(context.visit?.uuid).toBe(VISIT_UUID);
    expect(context.encounters.length).toBe(1);
  });

  it('returns visit: null (skipped) when nothing is closed — not an error', async () => {
    const { fetchImpl } = openmrsFetch([
      {
        match: (url) => url.includes('/ws/rest/v1/patient/'),
        respond: () => ({ uuid: PATIENT_UUID, identifiers: [] }),
      },
      {
        match: (url) => url.includes('/ws/rest/v1/visit'),
        respond: () => ({ results: [visitFixture({ stopDatetime: null })] }),
      },
    ]);
    jest.spyOn(global, 'fetch').mockImplementation(fetchImpl);
    const context = await clientWith().fetchClosedVisitContext(
      PATIENT_UUID,
      SESSION_COOKIE,
    );
    expect(context.visit).toBeNull();
    expect(context.encounters).toEqual([]);
  });
});
