import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AMRS_CONNECTION } from '../core/database/db.module';
import { FetchCaseSummaryDto } from './dto/fetch-case-summary.dto';
import {
  AllergyRow,
  CaseSummaryDemographics,
  CaseSummaryDiagnosis,
  CaseSummaryEncounter,
  CaseSummaryEncounterNote,
  CaseSummaryInpatientDetails,
  CaseSummaryMedication,
  CaseSummaryObs,
  CaseSummaryResponse,
  CaseSummaryTestOrder,
  CaseSummaryVitals,
  CaseSummaryWireInterpretation,
  ConceptSetMemberRow,
  DiagnosisRow,
  EncounterObsRow,
  EncounterRow,
  IdentifierRow,
  LabObsRow,
  ObsTreeNode,
  ObsTreeObs,
  OrderRow,
  VisitRow,
} from './types';
import {
  LabResultHelper,
  isAbnormal,
  readObsValue,
} from './utils/lab-result.helper';
import { SoapNoteHelper } from './utils/soap-note.helper';
import {
  VisitWindowHelper,
  isoDatePart,
  toOpenMrsDatetime,
} from './utils/visit-window.helper';

/** Confirmed against the live server (docs/case-summary-endpoint.md §5) — real getters, not a guess. */
export const DRUG_ORDER_TYPE_UUID = '53eb466e-1359-11df-a1f1-0026b9348838';
export const TEST_ORDER_TYPE_UUID = '53eb4768-1359-11df-a1f1-0026b9348838';
const DRUG_ORDER_JAVA_CLASS = 'org.openmrs.DrugOrder';
const TEST_ORDER_JAVA_CLASS = 'org.openmrs.TestOrder';

/** From `@ampath/esm-dha-workflow-app/src/resources/identifier-types.ts`. */
const NATIONAL_ID_UUID = '58a47054-1359-11df-a1f1-0026b9348838';
const CLIENT_REGISTRY_NO_UUID = 'e88dc246-3614-4ee3-8141-1f2a83054e72';

/**
 * ADT encounter types that mark a visit as an inpatient stay, from
 * `@ampath/esm-dha-workflow-app/src/admissions/constants`. `CANCEL_ADT` is
 * deliberately excluded — a cancelled admission request never became a stay.
 */
export const AdtEncounterTypeUuids = {
  ADMIT_ENCOUNTER_TYPE_UUID: 'e22e39fd-7db2-45e7-80f1-60fa0d5a4378',
  BED_ASSIGNMENT_ENCOUNTER_TYPE_UUID: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  DISCHARGE_ENCOUNTER_TYPE_UUID: '7649d97d-ac9f-444d-877c-7468ef286e7e',
  TRANSFER_REQUEST_ENCOUNTER_TYPE_UUID: 'b2c4d5e6-7f8a-4e9b-8c1d-2e3f8e4a3b8f',
};

const ADT_ENCOUNTER_TYPE_UUIDS: Array<string> = [
  AdtEncounterTypeUuids.ADMIT_ENCOUNTER_TYPE_UUID,
  AdtEncounterTypeUuids.BED_ASSIGNMENT_ENCOUNTER_TYPE_UUID,
  AdtEncounterTypeUuids.TRANSFER_REQUEST_ENCOUNTER_TYPE_UUID,
  AdtEncounterTypeUuids.DISCHARGE_ENCOUNTER_TYPE_UUID,
];

/** Recognises an obs label as one of the vitals shown in the Latest Vitals block. */
const VITAL_LABEL_TESTS: Array<(label: string) => boolean> = [
  (l) => /^temperature/i.test(l),
  (l) => /^pulse/i.test(l),
  (l) => /^respiratory rate/i.test(l),
  (l) => /^(blood oxygen saturation|spo2|oxygen saturation)/i.test(l),
  (l) => /^height/i.test(l),
  (l) => /^weight/i.test(l),
  (l) => /^body mass index/i.test(l),
  (l) => /^triage early warning score/i.test(l),
  // Bare "SYSTOLIC"/"DIASTOLIC" per the reference frontend, but this server's
  // triage form labels them "SYSTOLIC BLOOD PRESSURE"/"DIASTOLIC BLOOD PRESSURE" —
  // match both, or blood pressure silently drops out of vitals.
  (l) => /^systolic( blood pressure)?$/i.test(l),
  (l) => /^diastolic( blood pressure)?$/i.test(l),
];

function isVitalObs(label: string): boolean {
  return VITAL_LABEL_TESTS.some((test) => test(label));
}

/* ------------------------------------------------------------------ *
 * Pure mapping functions — clinical rules ported from
 * `case-summary.resource.ts` in `@ampath/esm-dha-workflow-app`. See
 * docs/case-summary-endpoint.md §6 for the numbered rule each one encodes.
 * ------------------------------------------------------------------ */

/**
 * Matches an identifier by its type's uuid, falling back to a display-name
 * substring for deployments where the type uuid isn't configured as
 * expected. Ported verbatim from `matchIdentifier`.
 */
function matchIdentifier(
  identifiers: Array<IdentifierRow>,
  typeUuid: string,
  displayFallback: string,
): string | undefined {
  return identifiers.find(
    (id) =>
      id.identifierTypeUuid === typeUuid ||
      (id.identifierTypeName ?? '').toLowerCase().includes(displayFallback),
  )?.identifier;
}

/** Calendar-based age in whole years. No REST equivalent to port — OpenMRS's `person.age` was server-computed; here it's computed directly from `birthdate`. */
function computeAge(birthdate?: string | null): string | undefined {
  if (!birthdate) return undefined;
  const born = new Date(birthdate);
  if (Number.isNaN(born.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const hadBirthdayThisYear =
    now.getMonth() > born.getMonth() ||
    (now.getMonth() === born.getMonth() && now.getDate() >= born.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return String(age);
}

/** Maps the anchor visit's nested demographics + identifiers to the demographics block. Ported from `mapDemographics`. */
export function mapDemographics(
  anchor: VisitRow,
  identifiers: Array<IdentifierRow>,
): CaseSummaryDemographics {
  const preferred = identifiers.find((id) => !!id.preferred);
  return {
    name: [anchor.givenName, anchor.middleName, anchor.familyName]
      .filter(Boolean)
      .join(' '),
    birthDate: anchor.birthdate ?? undefined,
    gender: anchor.gender ?? undefined,
    age: computeAge(anchor.birthdate),
    patientId: preferred?.identifier ?? identifiers[0]?.identifier,
    nationalId: matchIdentifier(identifiers, NATIONAL_ID_UUID, 'national id'),
    crNumber: matchIdentifier(identifiers, CLIENT_REGISTRY_NO_UUID, 'registry'),
  };
}

function formatQuantity(
  value?: number | null,
  unit?: string | null,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  return unit ? `${value} ${unit}` : String(value);
}

/** An order counts as active until it's stopped, discontinued, or auto-expires. Ported verbatim from `isDrugOrderActive`. */
export function isDrugOrderActive(
  order: {
    action?: string | null;
    dateStopped?: string | null;
    autoExpireDate?: string | null;
  },
  now: number = Date.now(),
): boolean {
  if (order.action === 'DISCONTINUE' || order.dateStopped) return false;
  if (
    order.autoExpireDate &&
    Date.parse(order.autoExpireDate.replace(' ', 'T')) < now
  )
    return false;
  return true;
}

function isDrugOrderRow(row: OrderRow): boolean {
  return (
    row.javaClassName === DRUG_ORDER_JAVA_CLASS ||
    row.orderTypeUuid === DRUG_ORDER_TYPE_UUID
  );
}

/** Maps one drug order row to a medication row. Ported from `mapDrugOrder`. */
export function mapDrugOrder(row: OrderRow): CaseSummaryMedication {
  const name = row.drugName ?? row.conceptName ?? '';
  const strength = row.drugStrength;
  return {
    date: toOpenMrsDatetime(row.dateActivated),
    // `drug.name` usually already embeds the strength, so only append when it doesn't.
    drug:
      strength && !name.includes(strength)
        ? `${name} ${strength}`.trim()
        : name,
    dose: formatQuantity(row.dose, row.doseUnitsName),
    route: row.routeName ?? undefined,
    frequency: row.frequencyName ?? undefined,
    duration: formatQuantity(row.duration, row.durationUnitsName),
    instructions: row.instructions ?? undefined,
  };
}

/**
 * Recognises a lab/test order, most-authoritative signal first (rule in
 * §5): `javaClassName` is the definitive discriminator, since several order
 * types on a real server are a bare `org.openmrs.Order` and only the true
 * lab type is a `TestOrder`. Ported verbatim from `isTestOrderType`.
 */
export function isTestOrderType(orderType?: {
  uuid?: string | null;
  display?: string | null;
  javaClassName?: string | null;
}): boolean {
  if (orderType?.javaClassName === DRUG_ORDER_JAVA_CLASS) return false;
  if (orderType?.uuid === DRUG_ORDER_TYPE_UUID) return false;
  const display = (orderType?.display ?? '').toLowerCase();
  if (/drug|medication|prescription/.test(display)) return false;

  if (orderType?.javaClassName === TEST_ORDER_JAVA_CLASS) return true;
  // A known non-test java class must not fall through to display matching.
  if (
    orderType?.javaClassName &&
    orderType.javaClassName !== TEST_ORDER_JAVA_CLASS
  )
    return false;
  if (orderType?.uuid === TEST_ORDER_TYPE_UUID) return true;
  return display.includes('test') || display.includes('lab');
}

/**
 * Maps order rows to test orders: drops discontinued, non-test rows, and
 * de-dupes by order uuid. Unlike the frontend's `mapTestOrders`, there is no
 * visit-scope filter (`orderBelongsToVisit`) — every row here already comes
 * from a `visit.uuid IN (?)` join, so it belongs to the visit by
 * construction (see docs/case-summary-endpoint.md §5).
 */
export function mapTestOrders(
  rows: Array<OrderRow>,
): Array<CaseSummaryTestOrder> {
  const byUuid = new Map<string, CaseSummaryTestOrder>();
  for (const row of rows) {
    if (row.action === 'DISCONTINUE') continue;
    if (
      !isTestOrderType({
        uuid: row.orderTypeUuid,
        display: row.orderTypeName,
        javaClassName: row.javaClassName,
      })
    )
      continue;
    if (byUuid.has(row.uuid)) continue;
    byUuid.set(row.uuid, {
      uuid: row.uuid,
      orderNumber: row.orderNumber ?? undefined,
      conceptId: row.conceptId,
      test: row.conceptName ?? '',
      orderedDate: toOpenMrsDatetime(row.dateActivated),
      action: row.action ?? undefined,
      fulfillerStatus: row.fulfillerStatus ?? undefined,
      results: [],
      pending: true,
    });
  }
  return Array.from(byUuid.values()).sort((a, b) =>
    (a.orderedDate ?? '').localeCompare(b.orderedDate ?? ''),
  );
}

/** The de-duplicated concept ids to walk the concept-set tree for. */
export function testOrderConceptIds(
  orders: Array<CaseSummaryTestOrder>,
): Array<number> {
  return Array.from(new Set(orders.map((order) => order.conceptId)));
}

/**
 * Builds a concept-tree node (and its subtree) from the flat rows Q3 returns,
 * for one ordered test's root concept — the in-process replacement for the
 * REST `obstree` resource. Pairing an order to its tree is no longer a
 * fuzzy uuid/display/positional match (`attachObsTreeResults` in the
 * frontend): the SQL join is already exact by `concept_id`, so this simply
 * roots the walk at the order's own concept id.
 */
export function buildConceptTree(
  rootConceptId: number,
  members: Array<ConceptSetMemberRow>,
  obsByConcept: Map<number, Array<ObsTreeObs>>,
): ObsTreeNode | undefined {
  const byId = new Map<number, ConceptSetMemberRow>();
  const childIdsByParent = new Map<number, Array<number>>();
  for (const member of members) {
    byId.set(member.conceptId, member);
    if (member.parentConceptId !== null) {
      const children = childIdsByParent.get(member.parentConceptId) ?? [];
      children.push(member.conceptId);
      childIdsByParent.set(member.parentConceptId, children);
    }
  }

  const toNode = (
    conceptId: number,
    visited: Set<number>,
  ): ObsTreeNode | undefined => {
    const member = byId.get(conceptId);
    // `visited` guards against a cyclical concept_set, which should never occur in
    // practice but must not hang the walk if a data-quality issue produces one.
    if (!member || visited.has(conceptId)) return undefined;
    visited.add(conceptId);
    return {
      conceptId,
      display: member.display,
      units: member.units ?? undefined,
      lowAbsolute: member.lowAbsolute,
      lowCritical: member.lowCritical,
      lowNormal: member.lowNormal,
      hiNormal: member.hiNormal,
      hiCritical: member.hiCritical,
      hiAbsolute: member.hiAbsolute,
      obs: obsByConcept.get(conceptId) ?? [],
      subSets: (childIdsByParent.get(conceptId) ?? [])
        .map((childId) => toNode(childId, visited))
        .filter((node): node is ObsTreeNode => !!node),
    };
  };

  return toNode(rootConceptId, new Set());
}

/** Groups Q2's flat obs rows under their encounters and maps each encounter row. New plumbing — the REST payload nested this already; SQL returns it flat. */
export function buildEncounters(
  encounterRows: Array<EncounterRow>,
  obsRows: Array<EncounterObsRow>,
): Array<CaseSummaryEncounter> {
  const obsByEncounter = new Map<number, Array<CaseSummaryObs>>();
  for (const row of obsRows) {
    const value = readObsValue(row);
    if (value === undefined) continue;
    const list = obsByEncounter.get(row.encounterId) ?? [];
    list.push({ label: row.conceptName, value });
    obsByEncounter.set(row.encounterId, list);
  }

  return encounterRows.map((row) => ({
    uuid: row.uuid,
    encounterDatetime: toOpenMrsDatetime(row.encounterDatetime),
    encounterTypeUuid: row.encounterTypeUuid,
    encounterType: row.encounterTypeName,
    location: row.locationName ?? undefined,
    provider: row.providerDisplay ?? undefined,
    obs: obsByEncounter.get(row.encounterId) ?? [],
  }));
}

/**
 * Builds the Latest Vitals block from the visit's encounter obs, picking the
 * most recent value per vital across all encounters. Ported from
 * `buildVitalsFromEncounters`, reshaped from an array of `{label,value}`
 * pairs to the keyed object the wire contract uses (§3.1) — display labels
 * belong in the view, not the response.
 */
export function buildVitalsFromEncounters(
  encounters: Array<CaseSummaryEncounter>,
): CaseSummaryVitals {
  const byRecency = [...encounters].sort((a, b) =>
    (b.encounterDatetime ?? '').localeCompare(a.encounterDatetime ?? ''),
  );
  const allObs = byRecency.flatMap((e) => e.obs);
  const latest = (test: (label: string) => boolean) =>
    allObs.find((o) => test(o.label))?.value;

  const systolic = latest((l) => /^systolic( blood pressure)?$/i.test(l));
  const diastolic = latest((l) => /^diastolic( blood pressure)?$/i.test(l));

  return {
    temperature: latest((l) => /^temperature/i.test(l)),
    bloodPressure:
      systolic && diastolic ? `${systolic}/${diastolic} mmHg` : undefined,
    pulse: latest((l) => /^pulse/i.test(l)),
    respiratoryRate: latest((l) => /^respiratory rate/i.test(l)),
    spo2: latest((l) =>
      /^(blood oxygen saturation|spo2|oxygen saturation)/i.test(l),
    ),
    height: latest((l) => /^height/i.test(l)),
    weight: latest((l) => /^weight/i.test(l)),
    bmi: latest((l) => /^body mass index/i.test(l)),
    tewScore: latest((l) => /^triage early warning score/i.test(l)),
  };
}

/**
 * Groups each encounter's non-vital obs into a Clinical Notes entry. Ported
 * from `buildEncounterNotes`.
 */
export function buildEncounterNotes(
  encounters: Array<CaseSummaryEncounter>,
): Array<CaseSummaryEncounterNote> {
  return encounters
    .map((e) => ({
      encounterUuid: e.uuid,
      encounterType: e.encounterType,
      datetime: e.encounterDatetime,
      fields: e.obs.filter((o) => !isVitalObs(o.label)),
    }))
    .filter((note) => note.fields.length > 0)
    .sort((a, b) => (b.datetime ?? '').localeCompare(a.datetime ?? ''));
}

/**
 * Derives inpatient admission details from a visit's ADT encounters, sorted
 * chronologically. Returns `undefined` when the visit carries no ADT
 * encounter. Ported verbatim from `buildInpatientDetails`.
 */
export function buildInpatientDetails(
  encounters: Array<CaseSummaryEncounter>,
): CaseSummaryInpatientDetails | undefined {
  const adtEncounters = encounters
    .filter(
      (e) =>
        !!e.encounterTypeUuid &&
        ADT_ENCOUNTER_TYPE_UUIDS.includes(e.encounterTypeUuid),
    )
    .sort((a, b) =>
      (a.encounterDatetime ?? '').localeCompare(b.encounterDatetime ?? ''),
    );
  if (!adtEncounters.length) return undefined;

  const admission = adtEncounters.find(
    (e) =>
      e.encounterTypeUuid === AdtEncounterTypeUuids.ADMIT_ENCOUNTER_TYPE_UUID,
  );
  const discharge = [...adtEncounters]
    .reverse()
    .find(
      (e) =>
        e.encounterTypeUuid ===
        AdtEncounterTypeUuids.DISCHARGE_ENCOUNTER_TYPE_UUID,
    );
  const latest = adtEncounters[adtEncounters.length - 1];

  return {
    admissionDate: admission?.encounterDatetime,
    ward: latest.location,
    doctor: admission?.provider ?? latest.provider,
    status: discharge ? 'Discharged' : 'Admitted',
    dischargeDate: discharge?.encounterDatetime,
  };
}

/**
 * Maps one diagnosis row to an Active Diagnosis. `code` and `certainty` are
 * already resolved by Q2's joins (ICD-11 via `concept_reference_map`, rank
 * via `encounter_diagnosis.dx_rank`) — no separate `resolveIcd11Codes`
 * round-trip exists here, since the join replaces it entirely (§5). Ported
 * from `mapConditionEntry`, adapted from a FHIR `Condition` entry to a raw
 * diagnosis row.
 */
export function mapConditionEntry(row: DiagnosisRow): CaseSummaryDiagnosis {
  return {
    code: row.icd11Code ?? undefined,
    description: row.conceptName,
    certainty: row.certainty ?? undefined,
    primary: row.dxRank === 1,
    onsetDate: toOpenMrsDatetime(row.onsetDate),
  };
}

export function mapAllergy(
  row: AllergyRow,
): CaseSummaryResponse['allergies'][number] {
  return {
    substance: row.substance,
    criticality: row.severity ?? undefined,
    reaction: row.reactions ?? undefined,
  };
}

/** Half-open datetime bounds for Q3's obs predicate — see the sargability note on Q3 in `queryLabObs`. */
export function labWindowBounds(window: {
  startDatetime?: string;
  stopDatetime?: string;
}): [string, string] {
  const startDay = isoDatePart(window.startDatetime) ?? '1900-01-01';
  const lower = `${startDay} 00:00:00`;
  const stopDay = isoDatePart(window.stopDatetime);
  if (!stopDay) return [lower, '2099-01-01 00:00:00'];
  const [year, month, day] = stopDay.split('-').map(Number);
  const dayAfter = new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10);
  return [lower, `${dayAfter} 00:00:00`];
}

const VISIT_SELECT = `
  SELECT v.uuid AS uuid,
         v.date_started AS dateStarted,
         v.date_stopped AS dateStopped,
         vt.name AS visitType,
         l.name AS locationName,
         pe.uuid AS patientUuid,
         pn.given_name AS givenName,
         pn.middle_name AS middleName,
         pn.family_name AS familyName,
         pe.gender AS gender,
         pe.birthdate AS birthdate
    FROM visit v
    JOIN visit_type vt ON vt.visit_type_id = v.visit_type_id
    JOIN person pe ON pe.person_id = v.patient_id
    LEFT JOIN location l ON l.location_id = v.location_id
    LEFT JOIN person_name pn ON pn.person_id = pe.person_id AND pn.preferred = 1 AND pn.voided = 0
`;

/**
 * Visit case summary: one assembled clinical document for printing and for
 * attachment to a SHA claim. Reads the AMRS OpenMRS schema directly
 * (docs/case-summary-endpoint.md §2) instead of proxying OpenMRS REST — see
 * that spec for the full rationale, the query shapes, and the ported
 * clinical rules (§6) this service and its `utils/` helpers implement.
 *
 * `dto.locationUuid` is accepted for consistency with every other DTO in
 * this package but isn't used by any query here — nothing in this endpoint
 * is location-scoped.
 */
@Injectable()
export class CaseSummaryService {
  constructor(
    @InjectDataSource(AMRS_CONNECTION)
    private readonly amrsDataSource: DataSource,
    private readonly labResultHelper: LabResultHelper,
    private readonly visitWindowHelper: VisitWindowHelper,
    private readonly soapNoteHelper: SoapNoteHelper,
  ) {}

  async getVisitCaseSummary(
    dto: FetchCaseSummaryDto,
  ): Promise<CaseSummaryResponse> {
    try {
      const visits = dto.visitUuid
        ? await this.queryVisitByUuid(dto.visitUuid)
        : await this.queryRecentVisits(dto.patientUuid);
      const anchor = this.visitWindowHelper.pickAnchorVisit(visits);
      if (!anchor) {
        throw new NotFoundException('No visit found for this patient.');
      }

      const merged = dto.visitUuid
        ? [anchor]
        : this.visitWindowHelper.sameDayVisits(visits, anchor);
      const window = this.visitWindowHelper.visitWindow(merged);
      const visitUuids = merged.map((visit) => visit.uuid);

      const [
        identifiers,
        encounterRows,
        obsRows,
        orderRows,
        diagnosisRows,
        allergyRows,
      ] = await Promise.all([
        this.queryIdentifiers(dto.patientUuid),
        this.queryEncounters(visitUuids),
        this.queryEncounterObs(visitUuids),
        this.queryOrders(visitUuids),
        this.queryDiagnoses(dto.patientUuid), // patient-level, NOT visit-scoped — rule 13
        this.queryAllergies(dto.patientUuid), // patient-level, NOT visit-scoped — rule 13
      ]);

      const encounters = buildEncounters(encounterRows, obsRows);
      const testOrders = mapTestOrders(orderRows);
      const now = Date.now();
      const medications = orderRows
        .filter((row) => isDrugOrderRow(row) && isDrugOrderActive(row, now))
        .map((row) => mapDrugOrder(row))
        .filter((medication) => !!medication.drug);

      const labs = await this.queryLabResults(
        dto.patientUuid,
        window,
        testOrderConceptIds(testOrders),
      ).catch((error) => {
        // Degrade, never fail the document (§3.1) — a lab failure must not take
        // down demographics, medications, vitals, or notes.
        Logger.error(`case summary lab results: ${(error as Error).message}`);
        return null;
      });
      const labOrders = this.attachLabResults(testOrders, labs, window);
      const conditions = diagnosisRows.map(mapConditionEntry);
      const vitals = buildVitalsFromEncounters(encounters);
      const clinicalNotes = buildEncounterNotes(encounters);

      return {
        visit: {
          uuid: anchor.uuid,
          display: anchor.locationName
            ? `${anchor.visitType} @ ${anchor.locationName}`
            : anchor.visitType,
          visitType: anchor.visitType,
          startDatetime: window.startDatetime,
          stopDatetime: window.stopDatetime,
        },
        visitUuids,
        demographics: mapDemographics(anchor, identifiers),
        allergies: allergyRows.map(mapAllergy),
        conditions: conditions.map((condition) => ({
          code: condition.code,
          description: condition.description,
          certainty: condition.certainty,
          primary: condition.primary ? true : undefined,
          onsetDate: condition.onsetDate,
        })),
        vitals,
        medications,
        clinicalNotes,
        soapNote: this.soapNoteHelper.build({
          clinicalNotes,
          vitals,
          conditions,
          medications,
          labOrders,
        }),
        labOrders: labOrders.map((order) => ({
          uuid: order.uuid,
          test: order.test,
          orderNumber: order.orderNumber,
          orderedDate: order.orderedDate,
          pending: order.pending ? true : undefined,
          action: order.action,
          fulfillerStatus: order.fulfillerStatus,
          results: order.results.map((result) => ({
            test: result.test,
            panel: result.panel,
            value: result.value,
            units: result.units,
            datetime: result.datetime,
            range: result.range,
            interpretation: isAbnormal(result.interpretation)
              ? (result.interpretation as CaseSummaryWireInterpretation)
              : undefined,
          })),
        })),
        labResultsUnavailable:
          labs === null && testOrders.length > 0 ? true : undefined,
        inpatientDetails: buildInpatientDetails(encounters),
      };
    } catch (error) {
      throw this.asHttpException(error);
    }
  }

  private attachLabResults(
    testOrders: Array<CaseSummaryTestOrder>,
    labs: { members: Array<ConceptSetMemberRow>; obs: Array<LabObsRow> } | null,
    window: { startDatetime?: string; stopDatetime?: string },
  ): Array<CaseSummaryTestOrder> {
    if (!labs) return testOrders;

    const obsByConcept = new Map<number, Array<ObsTreeObs>>();
    for (const row of labs.obs) {
      const list = obsByConcept.get(row.conceptId) ?? [];
      list.push({
        obsDatetime: row.obsDatetime,
        valueNumeric: row.valueNumeric,
        valueText: row.valueText,
        valueCodedName: row.valueCodedName,
      });
      obsByConcept.set(row.conceptId, list);
    }

    return testOrders.map((order) => {
      const tree = buildConceptTree(
        order.conceptId,
        labs.members,
        obsByConcept,
      );
      const results = tree
        ? this.labResultHelper.flattenObsTree(tree, { window })
        : [];
      return { ...order, results, pending: results.length === 0 };
    });
  }

  private asHttpException(error: unknown): HttpException {
    if (error instanceof HttpException) return error;
    Logger.error(error);
    return new HttpException(
      `AMRS database unreachable: ${(error as Error)?.message ?? error}`,
      HttpStatus.BAD_GATEWAY,
    );
  }

  /* ------------------------------------------------------------------ *
   * Q1 — candidate visits + identifiers
   * ------------------------------------------------------------------ */

  private queryVisitByUuid(visitUuid: string): Promise<Array<VisitRow>> {
    return this.amrsDataSource.query(
      `${VISIT_SELECT} WHERE v.uuid = ? AND v.voided = 0`,
      [visitUuid],
    );
  }

  private queryRecentVisits(patientUuid: string): Promise<Array<VisitRow>> {
    // `patient` has no `uuid` column of its own — it lives on `person`, which
    // `patient` extends (confirmed against the live schema).
    return this.amrsDataSource.query(
      `${VISIT_SELECT} WHERE pe.uuid = ? AND v.voided = 0 ORDER BY v.date_started DESC LIMIT 10`,
      [patientUuid],
    );
  }

  /**
   * Identifiers are matched by type uuid with a name fallback (`matchIdentifier`),
   * since identifier type uuids differ by deployment (§5).
   */
  private queryIdentifiers(patientUuid: string): Promise<Array<IdentifierRow>> {
    return this.amrsDataSource.query(
      `SELECT pi.identifier AS identifier,
              pit.uuid AS identifierTypeUuid,
              pit.name AS identifierTypeName,
              pi.preferred AS preferred
         FROM patient_identifier pi
         JOIN person pe ON pe.person_id = pi.patient_id
         JOIN patient_identifier_type pit ON pit.patient_identifier_type_id = pi.identifier_type
        WHERE pe.uuid = ? AND pi.voided = 0
        ORDER BY pi.preferred DESC`,
      [patientUuid],
    );
  }

  /* ------------------------------------------------------------------ *
   * Q2 — the visit bundle: encounters+obs, orders, diagnoses, allergies
   * ------------------------------------------------------------------ */

  private queryEncounters(
    visitUuids: Array<string>,
  ): Promise<Array<EncounterRow>> {
    return this.amrsDataSource.query(
      `SELECT e.encounter_id AS encounterId,
              e.uuid AS uuid,
              e.encounter_datetime AS encounterDatetime,
              et.uuid AS encounterTypeUuid,
              et.name AS encounterTypeName,
              l.name AS locationName,
              (SELECT CONCAT(pn.given_name, ' ', pn.family_name)
                 FROM encounter_provider ep
                 JOIN provider pr ON pr.provider_id = ep.provider_id
                 JOIN person_name pn ON pn.person_id = pr.person_id AND pn.voided = 0
                WHERE ep.encounter_id = e.encounter_id AND ep.voided = 0
                ORDER BY ep.encounter_provider_id
                LIMIT 1) AS providerDisplay
         FROM encounter e
         JOIN visit v ON v.visit_id = e.visit_id
         JOIN encounter_type et ON et.encounter_type_id = e.encounter_type
         LEFT JOIN location l ON l.location_id = e.location_id
        WHERE v.uuid IN (?) AND e.voided = 0
        ORDER BY e.encounter_datetime`,
      [visitUuids],
    );
  }

  /** Yields `{label, value}` structurally via `concept_name`, replacing the REST `display`-string split (`parseObsDisplay`) entirely (§5). */
  private queryEncounterObs(
    visitUuids: Array<string>,
  ): Promise<Array<EncounterObsRow>> {
    return this.amrsDataSource.query(
      `SELECT o.encounter_id AS encounterId,
              cn.name AS conceptName,
              o.value_numeric AS valueNumeric,
              o.value_text AS valueText,
              o.value_datetime AS valueDatetime,
              vcn.name AS valueCodedName
         FROM obs o
         JOIN encounter e ON e.encounter_id = o.encounter_id
         JOIN visit v ON v.visit_id = e.visit_id
         JOIN concept_name cn ON cn.concept_id = o.concept_id AND cn.voided = 0 AND cn.concept_name_type = 'FULLY_SPECIFIED' AND cn.locale = 'en'
         LEFT JOIN concept_name vcn ON vcn.concept_id = o.value_coded AND vcn.voided = 0 AND vcn.concept_name_type = 'FULLY_SPECIFIED' AND vcn.locale = 'en'
        WHERE v.uuid IN (?) AND o.voided = 0 AND e.voided = 0
        ORDER BY o.obs_datetime`,
      [visitUuids],
    );
  }

  /** Drug and test orders in one pass, discriminated downstream by `javaClassName` — replaces the dual care-setting fetch entirely (§5). */
  private queryOrders(visitUuids: Array<string>): Promise<Array<OrderRow>> {
    return this.amrsDataSource.query(
      `SELECT ord.uuid AS uuid,
              ord.order_number AS orderNumber,
              ord.order_action AS action,
              ord.date_activated AS dateActivated,
              ord.date_stopped AS dateStopped,
              ord.auto_expire_date AS autoExpireDate,
              ord.fulfiller_status AS fulfillerStatus,
              c.concept_id AS conceptId,
              c.uuid AS conceptUuid,
              cn.name AS conceptName,
              ot.uuid AS orderTypeUuid,
              ot.name AS orderTypeName,
              ot.java_class_name AS javaClassName,
              e.uuid AS encounterUuid,
              do.dose AS dose,
              doseUnitsName.name AS doseUnitsName,
              routeName.name AS routeName,
              freqName.name AS frequencyName,
              do.duration AS duration,
              durationUnitsName.name AS durationUnitsName,
              do.dosing_instructions AS instructions,
              drug.name AS drugName,
              drug.strength AS drugStrength
         FROM orders ord
         JOIN encounter e ON e.encounter_id = ord.encounter_id
         JOIN visit v ON v.visit_id = e.visit_id
         JOIN order_type ot ON ot.order_type_id = ord.order_type_id
         JOIN concept c ON c.concept_id = ord.concept_id
         LEFT JOIN concept_name cn ON cn.concept_id = c.concept_id AND cn.voided = 0 AND cn.concept_name_type = 'FULLY_SPECIFIED' AND cn.locale = 'en'
         LEFT JOIN drug_order do ON do.order_id = ord.order_id
         LEFT JOIN drug ON drug.drug_id = do.drug_inventory_id
         LEFT JOIN concept_name doseUnitsName ON doseUnitsName.concept_id = do.dose_units AND doseUnitsName.voided = 0 AND doseUnitsName.concept_name_type = 'FULLY_SPECIFIED' AND doseUnitsName.locale = 'en'
         LEFT JOIN concept_name routeName ON routeName.concept_id = do.route AND routeName.voided = 0 AND routeName.concept_name_type = 'FULLY_SPECIFIED' AND routeName.locale = 'en'
         LEFT JOIN order_frequency freq ON freq.order_frequency_id = do.frequency
         LEFT JOIN concept_name freqName ON freqName.concept_id = freq.concept_id AND freqName.voided = 0 AND freqName.concept_name_type = 'FULLY_SPECIFIED' AND freqName.locale = 'en'
         LEFT JOIN concept_name durationUnitsName ON durationUnitsName.concept_id = do.duration_units AND durationUnitsName.voided = 0 AND durationUnitsName.concept_name_type = 'FULLY_SPECIFIED' AND durationUnitsName.locale = 'en'
        WHERE v.uuid IN (?) AND ord.voided = 0 group by ord.uuid`,
      [visitUuids],
    );
  }

  /** Patient-level, NOT visit-scoped (rule 13) — a standing problem list predates the visit. ICD-11 comes from a join, replacing the per-concept `/concept/{uuid}` lookup entirely (§5). */
  private queryDiagnoses(patientUuid: string): Promise<Array<DiagnosisRow>> {
    return this.amrsDataSource.query(
      `SELECT cn.name AS conceptName,
              ed.certainty AS certainty,
              ed.dx_rank AS dxRank,
              e.encounter_datetime AS onsetDate,
              crt.code AS icd11Code
         FROM encounter_diagnosis ed
         JOIN encounter e ON e.encounter_id = ed.encounter_id
         JOIN person pe ON pe.person_id = e.patient_id
         JOIN concept c ON c.concept_id = ed.diagnosis_coded
         JOIN concept_name cn ON cn.concept_id = c.concept_id AND cn.voided = 0 AND cn.concept_name_type = 'FULLY_SPECIFIED' AND cn.locale = 'en'
         LEFT JOIN concept_reference_map crm ON crm.concept_id = c.concept_id
         LEFT JOIN concept_reference_term crt ON crt.concept_reference_term_id = crm.concept_reference_term_id
         LEFT JOIN concept_reference_source crs ON crs.concept_source_id = crt.concept_source_id AND crs.name LIKE '%ICD%11%'
        WHERE pe.uuid = ? AND ed.voided = 0
        ORDER BY ed.dx_rank`,
      [patientUuid],
    );
  }

  /** Patient-level, NOT visit-scoped (rule 13). */
  private queryAllergies(patientUuid: string): Promise<Array<AllergyRow>> {
    return this.amrsDataSource.query(
      `SELECT cn.name AS substance,
              sevCn.name AS severity,
              GROUP_CONCAT(DISTINCT reactCn.name SEPARATOR ', ') AS reactions
         FROM allergy a
         JOIN person pe ON pe.person_id = a.patient_id
         JOIN concept c ON c.concept_id = a.coded_allergen
         JOIN concept_name cn ON cn.concept_id = c.concept_id AND cn.voided = 0 AND cn.concept_name_type = 'FULLY_SPECIFIED' AND cn.locale = 'en'
         LEFT JOIN concept sev ON sev.concept_id = a.severity_concept_id
         LEFT JOIN concept_name sevCn ON sevCn.concept_id = sev.concept_id AND sevCn.voided = 0 AND sevCn.concept_name_type = 'FULLY_SPECIFIED' AND sevCn.locale = 'en'
         LEFT JOIN allergy_reaction ar ON ar.allergy_id = a.allergy_id
         LEFT JOIN concept_name reactCn ON reactCn.concept_id = ar.reaction_concept_id AND reactCn.voided = 0 AND reactCn.concept_name_type = 'FULLY_SPECIFIED' AND reactCn.locale = 'en'
        WHERE pe.uuid = ? AND a.voided = 0
        GROUP BY a.allergy_id, cn.name, sevCn.name`,
      [patientUuid],
    );
  }

  /* ------------------------------------------------------------------ *
   * Q3 — lab results: concept-set tree + windowed obs
   * ------------------------------------------------------------------ */

  private async queryLabResults(
    patientUuid: string,
    window: { startDatetime?: string; stopDatetime?: string },
    rootConceptIds: Array<number>,
  ): Promise<{ members: Array<ConceptSetMemberRow>; obs: Array<LabObsRow> }> {
    if (!rootConceptIds.length) return { members: [], obs: [] };
    const members = await this.queryConceptTree(rootConceptIds);
    const memberConceptIds = members.map((member) => member.conceptId);
    if (!memberConceptIds.length) return { members, obs: [] };
    const obs = await this.queryLabObs(patientUuid, window, memberConceptIds);
    return { members, obs };
  }

  /** `depth < 6` mirrors the frontend's `OBS_TREE_MAX_DEPTH`; real panels nest 1-2 deep (§5). */
  private queryConceptTree(
    rootConceptIds: Array<number>,
  ): Promise<Array<ConceptSetMemberRow>> {
    return this.amrsDataSource.query(
      `WITH RECURSIVE members AS (
         SELECT c.concept_id AS conceptId, NULL AS parentConceptId, 0 AS depth
           FROM concept c
          WHERE c.concept_id IN (?)
         UNION ALL
         SELECT cs.concept_id, cs.concept_set, m.depth + 1
           FROM concept_set cs
           JOIN members m ON cs.concept_set = m.conceptId
          WHERE m.depth < 6
       )
       SELECT m.conceptId AS conceptId,
              m.parentConceptId AS parentConceptId,
              m.depth AS depth,
              cn.name AS display,
              cnum.units AS units,
              cnum.hi_absolute AS hiAbsolute,
              cnum.hi_critical AS hiCritical,
              cnum.hi_normal AS hiNormal,
              cnum.low_normal AS lowNormal,
              cnum.low_critical AS lowCritical,
              cnum.low_absolute AS lowAbsolute
         FROM members m
         JOIN concept_name cn ON cn.concept_id = m.conceptId AND cn.voided = 0 AND cn.concept_name_type = 'FULLY_SPECIFIED' AND cn.locale = 'en'
         LEFT JOIN concept_numeric cnum ON cnum.concept_id = m.conceptId`,
      [rootConceptIds],
    );
  }

  /**
   * The obs predicate is bound as a half-open datetime range, never
   * `DATE(o.obs_datetime) BETWEEN ? AND ?` — wrapping the column in a
   * function would make the predicate non-sargable (§5.1). `person_id` is
   * the selective predicate; the window narrows a lifetime of obs down to
   * the visit's span.
   */
  private queryLabObs(
    patientUuid: string,
    window: { startDatetime?: string; stopDatetime?: string },
    memberConceptIds: Array<number>,
  ): Promise<Array<LabObsRow>> {
    const [lower, upper] = labWindowBounds(window);
    return this.amrsDataSource.query(
      `SELECT o.concept_id AS conceptId,
              o.obs_datetime AS obsDatetime,
              o.value_numeric AS valueNumeric,
              o.value_text AS valueText,
              vcn.name AS valueCodedName
         FROM obs o
         LEFT JOIN concept_name vcn ON vcn.concept_id = o.value_coded AND vcn.voided = 0 AND vcn.concept_name_type = 'FULLY_SPECIFIED' AND vcn.locale = 'en'
        WHERE o.person_id = (SELECT person_id FROM person WHERE uuid = ?)
          AND o.voided = 0
          AND o.obs_datetime >= ?
          AND o.obs_datetime <  ?
          AND o.concept_id IN (?)`,
      [patientUuid, lower, upper, memberConceptIds],
    );
  }
}
