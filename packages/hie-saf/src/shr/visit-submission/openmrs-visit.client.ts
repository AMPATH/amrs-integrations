import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ClosedVisitContext,
  OpenMrsEncounter,
  OpenMrsPatient,
  OpenMrsVisit,
} from './types';

/**
 * OpenMRS REST client — the gather step of `POST /shr/visit-submission`:
 * "Query the OpenMRS API to fetch the latest closed visit for that specific
 * patient, including associated encounters and observations."
 *
 * Calls ride the CALLER's OpenMRS session cookie (`JSESSIONID`), exactly like
 * `OpenMrsAuthGuard` and `PractitionerResolver` — the clinician closing the
 * visit is the one authorized to read that patient's data, so no service
 * account is involved.
 *
 * Endpoint shapes follow the patterns the AMRS frontend already uses:
 *
 *  - visit search with `includeInactive` (a closed visit is "inactive", so the
 *    default `includeInactive=false` would hide exactly the visits we want);
 *  - one custom representation per resource carrying every field the FHIR
 *    mapper needs, including concept `mappings` so diagnoses and observations
 *    can carry real standard codes (ICD-10, LOINC, SNOMED, CIEL) instead of
 *    AMRS UUIDs alone.
 */
@Injectable()
export class OpenMrsVisitClient {
  private readonly baseOpenMrsUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.baseOpenMrsUrl = this.configService.get<string>('AMRS_BASE_URL') ?? '';
  }

  /** Patient rep: identifiers with types (for the SHA identifier mapping) + demographics. */
  private static readonly PATIENT_REP =
    'custom:(uuid,identifiers:(uuid,identifier,preferred,identifierType:(uuid,display)),' +
    'person:(uuid,gender,birthdate,dead,preferredName:(givenName,middleName,familyName)))';

  /** Visit rep: closure datetimes, type, location, ownership and attributes. */
  private static readonly VISIT_REP =
    'custom:(uuid,visitType:(uuid,display),location:(uuid,display),patient:(uuid),' +
    'startDatetime,stopDatetime,' +
    'attributes:(uuid,value,valueReference,attributeType:(uuid,display)))';

  /** Encounter rep: everything the mapper turns into FHIR, one request wide. */
  private static readonly ENCOUNTER_REP =
    'custom:(uuid,encounterDatetime,encounterType:(uuid,display),location:(uuid,display),visit:(uuid),' +
    'encounterProviders:(uuid,provider:(uuid,display)),' +
    'diagnoses:(uuid,rank,certainty,diagnosis:(coded:(uuid,display,datatype:(display),mappings:(conceptMapType:(display),conceptReferenceTerm:(code,conceptSource:(name)))),nonCoded:(display))),' +
    'obs:(uuid,voided,obsDatetime,concept:(uuid,display,datatype:(display),mappings:(conceptMapType:(display),conceptReferenceTerm:(code,conceptSource:(name)))),' +
    'value,valueText,valueNumeric,valueCoded:(uuid,display,datatype:(display),mappings:(conceptMapType:(display),conceptReferenceTerm:(code,conceptSource:(name)))),valueDate,valueDatetime,valueBoolean,' +
    'groupMembers:(uuid,voided,obsDatetime,concept:(uuid,display,datatype:(display)),value,valueText,valueNumeric,valueCoded:(uuid,display)))))';

  private async getFromOpenMrs<T>(
    path: string,
    sessionCookie: string,
    context: string,
  ): Promise<T> {
    if (!sessionCookie) {
      throw new BadRequestException(
        'Cannot read the closed visit from OpenMRS: OpenMRS session cookie (JSESSIONID) is missing',
      );
    }
    try {
      const response = await fetch(
        `https://${this.baseOpenMrsUrl}/openmrs/ws/rest/v1${path}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            cookie: `JSESSIONID=${sessionCookie}`,
          },
        },
      );
      if (response.status === 404) {
        throw new NotFoundException(`OpenMRS ${context} lookup failed (404)`);
      }
      if (!response.ok) {
        Logger.error(`OpenMRS ${context} lookup ${response.status}`);
        throw new HttpException(
          `OpenMRS ${context} lookup failed (${response.status})`,
          HttpStatus.BAD_GATEWAY,
        );
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      Logger.error(error);
      throw new HttpException(
        `Error reading the OpenMRS ${context}: ${(error as Error)?.message ?? error}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** The patient and every identifier the SHA identifier mapping needs. */
  async getPatient(
    patientUuid: string,
    sessionCookie: string,
  ): Promise<OpenMrsPatient> {
    try {
      return await this.getFromOpenMrs<OpenMrsPatient>(
        `/patient/${encodeURIComponent(patientUuid)}?v=${OpenMrsVisitClient.PATIENT_REP}`,
        sessionCookie,
        'patient',
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(`No patient found for uuid ${patientUuid}`);
      }
      throw error;
    }
  }

  /**
   * Every visit for the patient (closed visits included), newest closure first.
   *
   * REST visits sort ascending by `startDatetime` by default, so `limit` would
   * cap at the OLDEST visits for long-standing patients. Fetch a bounded page
   * and sort client-side; `MAX_VISITS_SCANNED` is the safety valve.
   */
  private static readonly MAX_VISITS_SCANNED = 200;

  async getVisits(
    patientUuid: string,
    sessionCookie: string,
    locationUuid?: string,
  ): Promise<OpenMrsVisit[]> {
    const params = new URLSearchParams({
      patient: patientUuid,
      includeInactive: 'true',
      v: OpenMrsVisitClient.VISIT_REP,
      limit: String(OpenMrsVisitClient.MAX_VISITS_SCANNED),
    });
    if (locationUuid) {
      params.set('location', locationUuid);
    }
    const body = await this.getFromOpenMrs<{ results?: OpenMrsVisit[] }>(
      `/visit?${params.toString()}`,
      sessionCookie,
      'visit',
    );
    return body.results ?? [];
  }

  /** The visit with the most recent `stopDatetime`, or null when none is closed. */
  async getLatestClosedVisit(
    patientUuid: string,
    sessionCookie: string,
    locationUuid?: string,
  ): Promise<OpenMrsVisit | null> {
    const visits = await this.getVisits(
      patientUuid,
      sessionCookie,
      locationUuid,
    );
    const location = locationUuid ?? null;
    const closed = visits
      .filter((visit) => Boolean(visit.stopDatetime))
      .filter((visit) => !location || visit.location?.uuid === location)
      // Newest closure first; `startDatetime` breaks ties deterministically.
      .sort(
        (a, b) =>
          compareDatetimes(b.stopDatetime, a.stopDatetime) ||
          compareDatetimes(b.startDatetime, a.startDatetime),
      );
    return closed[0] ?? null;
  }

  /** A specific visit, verified closed and verified to belong to the patient. */
  async getClosedVisit(
    patientUuid: string,
    visitUuid: string,
    sessionCookie: string,
  ): Promise<OpenMrsVisit> {
    let visit: OpenMrsVisit;
    try {
      visit = await this.getFromOpenMrs<OpenMrsVisit>(
        `/visit/${encodeURIComponent(visitUuid)}?v=${OpenMrsVisitClient.VISIT_REP}`,
        sessionCookie,
        'visit',
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(`No visit found for uuid ${visitUuid}`);
      }
      throw error;
    }
    if (visit.patient?.uuid && visit.patient.uuid !== patientUuid) {
      throw new BadRequestException(
        `Visit ${visitUuid} belongs to a different patient`,
      );
    }
    if (!visit.stopDatetime) {
      throw new ConflictException(
        `Visit ${visitUuid} is not closed (no stopDatetime)`,
      );
    }
    return visit;
  }

  /**
   * The visit's encounters, each with obs, diagnoses and providers inline.
   *
   * Encounters are searched with both `patient` and `visit` params; if the
   * `visit` param is ever unsupported or ignored by the REST module, the
   * client-side fallback re-queries by patient and filters on `visit.uuid`
   * so correctness never depends on server-side parameter support.
   */
  async getVisitEncounters(
    patientUuid: string,
    visitUuid: string,
    sessionCookie: string,
  ): Promise<OpenMrsEncounter[]> {
    const byVisit = await this.getFromOpenMrs<{ results?: OpenMrsEncounter[] }>(
      `/encounter?patient=${encodeURIComponent(patientUuid)}&visit=${encodeURIComponent(visitUuid)}` +
        `&v=${OpenMrsVisitClient.ENCOUNTER_REP}&limit=200`,
      sessionCookie,
      'encounter',
    );
    if (byVisit.results?.length) {
      return byVisit.results.filter((encounter) => !encounter.voided);
    }
    // Fallback: the visit filter may not have been honoured (or the visit has
    // no encounters) — one page of the patient's encounters, filtered here.
    const body = await this.getFromOpenMrs<{ results?: OpenMrsEncounter[] }>(
      `/encounter?patient=${encodeURIComponent(patientUuid)}&v=${OpenMrsVisitClient.ENCOUNTER_REP}&limit=500`,
      sessionCookie,
      'encounter',
    );
    return (body.results ?? []).filter(
      (encounter) => !encounter.voided && encounter.visit?.uuid === visitUuid,
    );
  }

  /**
   * The gather step, assembled: patient + the chosen closed visit + its
   * encounters. `visitUuid` selects a specific visit; otherwise the latest
   * closed one wins and a `null` visit means "skipped — nothing to submit".
   */
  async fetchClosedVisitContext(
    patientUuid: string,
    sessionCookie: string,
    options: { locationUuid?: string; visitUuid?: string } = {},
  ): Promise<ClosedVisitContext> {
    const patient = await this.getPatient(patientUuid, sessionCookie);
    const visit = options.visitUuid
      ? await this.getClosedVisit(patientUuid, options.visitUuid, sessionCookie)
      : await this.getLatestClosedVisit(
          patientUuid,
          sessionCookie,
          options.locationUuid,
        );
    // A null visit is a normal outcome — "no closed visit to submit" — the
    // service turns it into status: "skipped", not an error.
    if (!visit) {
      return { patient, visit: null, encounters: [] };
    }
    const encounters = await this.getVisitEncounters(
      patientUuid,
      visit.uuid,
      sessionCookie,
    );
    return { patient, visit, encounters };
  }
}

/** Compare two OpenMRS ISO datetimes, null-safe, ascending. */
function compareDatetimes(a?: string | null, b?: string | null): number {
  const ta = a ? Date.parse(a) : Number.NaN;
  const tb = b ? Date.parse(b) : Number.NaN;
  if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
  if (Number.isNaN(ta)) return -1;
  if (Number.isNaN(tb)) return 1;
  return ta - tb;
}
