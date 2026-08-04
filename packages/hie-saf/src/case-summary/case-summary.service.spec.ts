import { getDataSourceToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { AMRS_CONNECTION } from '../core/database/db.module';
import {
  AdtEncounterTypeUuids,
  buildConceptTree,
  buildEncounterNotes,
  buildEncounters,
  buildInpatientDetails,
  buildVitalsFromEncounters,
  CaseSummaryService,
  DRUG_ORDER_TYPE_UUID,
  isDrugOrderActive,
  isTestOrderType,
  labWindowBounds,
  mapAllergy,
  mapConditionEntry,
  mapDemographics,
  mapDrugOrder,
  mapTestOrders,
  TEST_ORDER_TYPE_UUID,
  testOrderConceptIds,
} from './case-summary.service';
import {
  AllergyRow,
  ConceptSetMemberRow,
  DiagnosisRow,
  EncounterObsRow,
  EncounterRow,
  IdentifierRow,
  LabObsRow,
  OrderRow,
  VisitRow,
} from './types';
import {
  assessValue,
  flattenObsTree,
  formatReferenceRange,
  isAbnormal,
  LabResultHelper,
  readObsValue,
} from './utils/lab-result.helper';
import { buildSoapNote, SoapNoteHelper } from './utils/soap-note.helper';
import {
  isoDatePart,
  pickAnchorVisit,
  sameDayVisits,
  toOpenMrsDatetime,
  visitWindow,
  VisitWindowHelper,
} from './utils/visit-window.helper';

function visitRow(overrides: Partial<VisitRow> = {}): VisitRow {
  return {
    uuid: 'visit-1',
    dateStarted: '2026-08-03 07:00:00',
    dateStopped: null,
    visitType: 'OPD Visit',
    locationName: 'Location Test',
    patientUuid: 'patient-1',
    givenName: 'shariff',
    middleName: null,
    familyName: 'Kipkemoi',
    gender: 'M',
    birthdate: '1997-11-29',
    ...overrides,
  };
}

function orderRow(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    uuid: 'o1',
    orderNumber: null,
    action: null,
    dateActivated: '2026-01-01 08:00:00',
    dateStopped: null,
    autoExpireDate: null,
    conceptId: 1,
    conceptUuid: 'concept-1',
    conceptName: 'Unspecified antibiotic',
    orderTypeUuid: DRUG_ORDER_TYPE_UUID,
    orderTypeName: 'Drug',
    javaClassName: 'org.openmrs.DrugOrder',
    fulfillerStatus: null,
    encounterUuid: 'enc-1',
    dose: null,
    doseUnitsName: null,
    routeName: null,
    frequencyName: null,
    duration: null,
    durationUnitsName: null,
    instructions: null,
    drugName: null,
    drugStrength: null,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ *
 * utils/lab-result.helper.ts — ported from case-summary.resource.test.ts
 * ------------------------------------------------------------------ */

describe('readObsValue', () => {
  it('coerces numbers, coded names, and text', () => {
    expect(readObsValue({ valueNumeric: 5.4 })).toBe('5.4');
    expect(readObsValue({ valueNumeric: 0 })).toBe('0');
    expect(readObsValue({ valueText: '  Positive ' })).toBe('Positive');
    expect(readObsValue({ valueCodedName: 'Reactive' })).toBe('Reactive');
  });

  it('returns undefined for absent and blank values so the node is skipped', () => {
    expect(readObsValue({})).toBeUndefined();
    expect(readObsValue({ valueText: '   ' })).toBeUndefined();
    expect(readObsValue({ valueCodedName: '   ' })).toBeUndefined();
  });
});

describe('assessValue', () => {
  const range = { lowNormal: 4, hiNormal: 7, lowAbsolute: 1, hiAbsolute: 20 };

  it('classifies within and outside the normal range', () => {
    expect(assessValue('5', range)).toBe('NORMAL');
    expect(assessValue('8', range)).toBe('HIGH');
    expect(assessValue('3', range)).toBe('LOW');
  });

  it('classifies breaches of the absolute bounds as off-scale', () => {
    expect(assessValue('25', range)).toBe('OFF_SCALE_HIGH');
    expect(assessValue('0.5', range)).toBe('OFF_SCALE_LOW');
  });

  it('uses critical bounds when the server populates them', () => {
    expect(
      assessValue('15', { lowNormal: 4, hiNormal: 7, hiCritical: 12 }),
    ).toBe('CRITICALLY_HIGH');
    expect(
      assessValue('2', { lowNormal: 4, hiNormal: 7, lowCritical: 3 }),
    ).toBe('CRITICALLY_LOW');
  });

  it('honours a zero bound instead of treating it as absent', () => {
    // `0` is falsy — presence must be tested with != null, not truthiness.
    expect(assessValue('-1', { lowNormal: 0, hiNormal: 7 })).toBe('LOW');
    expect(assessValue('3', { lowNormal: 0, hiNormal: 7 })).toBe('NORMAL');
  });

  it('returns "--" rather than NORMAL when nothing can be assessed', () => {
    expect(assessValue('Positive', range)).toBe('--');
    expect(assessValue('5', {})).toBe('--');
  });

  it('treats an inverted range as normal so a mis-configured concept flags nothing', () => {
    expect(assessValue('5', { lowNormal: 10, hiNormal: 2 })).toBe('NORMAL');
  });

  it('classifies the real HEMATOCRIT payload as HIGH', () => {
    expect(assessValue('200', { lowNormal: 36.1, hiNormal: 50.3 })).toBe(
      'HIGH',
    );
  });
});

describe('isAbnormal', () => {
  it('is false only for NORMAL and unassessable', () => {
    expect(isAbnormal('NORMAL')).toBe(false);
    expect(isAbnormal('--')).toBe(false);
    expect(isAbnormal('HIGH')).toBe(true);
    expect(isAbnormal('CRITICALLY_LOW')).toBe(true);
  });
});

describe('formatReferenceRange', () => {
  it('formats both, one-sided, and absent ranges', () => {
    expect(formatReferenceRange({ lowNormal: 13, hiNormal: 17 })).toBe(
      '13 – 17',
    );
    expect(formatReferenceRange({ lowNormal: 13 })).toBe('≥ 13');
    expect(formatReferenceRange({ hiNormal: 17 })).toBe('≤ 17');
    expect(formatReferenceRange({})).toBeUndefined();
    expect(formatReferenceRange({ lowNormal: 0, hiNormal: 5 })).toBe('0 – 5');
  });
});

describe('flattenObsTree', () => {
  const window = {
    startDatetime: '2026-08-03T09:01:34.000+0300',
    stopDatetime: '2026-08-03T20:00:00.000+0300',
  };

  it('flattens a single test with one observation', () => {
    const rows = flattenObsTree({
      conceptId: 1,
      display: 'RANDOM BLOOD SUGAR',
      units: 'mmol/L',
      lowNormal: 4,
      hiNormal: 7,
      obs: [{ obsDatetime: '2026-01-02 09:00:00', valueNumeric: 5.4 }],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      test: 'RANDOM BLOOD SUGAR',
      value: '5.4',
      units: 'mmol/L',
      range: '4 – 7',
      interpretation: 'NORMAL',
      panel: undefined,
    });
  });

  it('expands a panel into one row per member, carrying the panel name', () => {
    const rows = flattenObsTree({
      display: 'FULL HAEMOGRAM',
      subSets: [
        {
          conceptId: 10,
          display: 'Haemoglobin',
          obs: [{ obsDatetime: '2026-01-02 09:00:00', valueNumeric: 9 }],
          lowNormal: 13,
          hiNormal: 17,
        },
        {
          conceptId: 11,
          display: 'White cell count',
          obs: [{ obsDatetime: '2026-01-02 09:00:00', valueNumeric: 6 }],
          lowNormal: 4,
          hiNormal: 11,
        },
      ],
    });

    expect(rows.map((r) => r.test)).toEqual([
      'Haemoglobin',
      'White cell count',
    ]);
    // The root here IS the ordered test; its name is not a row label — `panel` is
    // reserved for a *nested* sub-panel.
    expect(rows.every((r) => r.panel === undefined)).toBe(true);
    expect(rows[0]).toMatchObject({ interpretation: 'LOW' });
  });

  it('walks nesting deeper than one level', () => {
    const rows = flattenObsTree({
      display: 'Outer',
      subSets: [
        {
          display: 'Inner',
          subSets: [
            {
              conceptId: 99,
              display: 'Deep analyte',
              obs: [{ obsDatetime: '2026-01-02 09:00:00', valueNumeric: 1 }],
            },
          ],
        },
      ],
    });

    expect(rows.map((r) => r.test)).toEqual(['Deep analyte']);
    expect(rows[0].panel).toBe('Inner');
  });

  it('emits nothing for a node whose obs array is empty (ordered, not yet resulted)', () => {
    expect(
      flattenObsTree({ conceptId: 1, display: 'Pending test', obs: [] }),
    ).toEqual([]);
  });

  it('picks the latest observation regardless of array order', () => {
    const rows = flattenObsTree({
      conceptId: 1,
      display: 'Glucose',
      obs: [
        { obsDatetime: '2026-01-02 09:00:00', valueNumeric: 5 },
        { obsDatetime: '2026-01-05 09:00:00', valueNumeric: 9 },
        { obsDatetime: '2026-01-03 09:00:00', valueNumeric: 7 },
      ],
    });

    expect(rows[0].value).toBe('9');
    expect(rows[0].datetime).toBe('2026-01-05T09:00:00.000+0300');
  });

  it('drops observations from a different day than the visit', () => {
    // The core guard: without it, a months-old value reads as this visit's result.
    const rows = flattenObsTree(
      {
        conceptId: 1,
        display: 'Glucose',
        obs: [{ obsDatetime: '2026-06-02 12:33:46', valueNumeric: 5 }],
      },
      { window },
    );

    expect(rows).toEqual([]);
  });

  it('drops an observation from AFTER the visit day too, not just before', () => {
    const rows = flattenObsTree(
      {
        conceptId: 1,
        display: 'Glucose',
        obs: [{ obsDatetime: '2026-08-04 09:00:00', valueNumeric: 5 }],
      },
      { window },
    );

    expect(rows).toEqual([]);
  });

  it('keeps the visit-day observation and ignores another day for the same concept', () => {
    const rows = flattenObsTree(
      {
        conceptId: 1,
        display: 'Glucose',
        obs: [
          { obsDatetime: '2026-06-02 12:33:46', valueNumeric: 5 },
          { obsDatetime: '2026-08-03 11:15:05', valueNumeric: 8 },
        ],
      },
      { window },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe('8');
  });

  it('keeps a result posted after the start day while the visit is still open', () => {
    // Regression: the visit opened 31/07 with no stopDatetime, the lab posted on 03/08.
    // Filtering on the start day ALONE would show this order as "Pending" despite a
    // real value — an open visit must have no upper bound.
    const rows = flattenObsTree(
      {
        conceptId: 1,
        display: 'RANDOM BLOOD SUGAR',
        units: 'mmol/L',
        lowNormal: 2.0,
        hiNormal: 5.5,
        obs: [{ obsDatetime: '2026-08-03 15:12:33', valueNumeric: 5.0 }],
      },
      { window: { startDatetime: '2026-07-31T09:01:34.000+0300' } },
    );

    expect(rows).toHaveLength(1);
    // `5` not `5.0` — a real typed DOUBLE column, unlike the REST `obstree` resource
    // which stringified every value.
    expect(rows[0]).toMatchObject({ value: '5', interpretation: 'NORMAL' });
  });

  it('covers every day of a multi-day inpatient stay, and excludes days outside it', () => {
    const node = (day: string) => ({
      conceptId: 1,
      display: 'SERUM CREATININE',
      obs: [{ obsDatetime: `${day} 08:00:00`, valueNumeric: 90 }],
    });
    const admission = {
      startDatetime: '2026-08-01T09:00:00.000+0300',
      stopDatetime: '2026-08-05T17:00:00.000+0300',
    };

    expect(
      flattenObsTree(node('2026-08-01'), { window: admission }),
    ).toHaveLength(1);
    expect(
      flattenObsTree(node('2026-08-03'), { window: admission }),
    ).toHaveLength(1);
    expect(
      flattenObsTree(node('2026-08-05'), { window: admission }),
    ).toHaveLength(1);
    expect(flattenObsTree(node('2026-07-31'), { window: admission })).toEqual(
      [],
    );
    expect(flattenObsTree(node('2026-08-06'), { window: admission })).toEqual(
      [],
    );
  });

  it('drops an undated observation when a day is given, but keeps it when there is none', () => {
    const node = {
      conceptId: 1,
      display: 'Glucose',
      obs: [{ valueNumeric: 5 }],
    };

    expect(flattenObsTree(node, { window })).toEqual([]);
    expect(flattenObsTree(node)).toHaveLength(1);
  });

  it('emits a node that carries both its own obs and subSets', () => {
    const rows = flattenObsTree({
      conceptId: 1,
      display: 'Parent',
      obs: [{ obsDatetime: '2026-01-02 09:00:00', valueNumeric: 1 }],
      subSets: [
        {
          conceptId: 2,
          display: 'Child',
          obs: [{ obsDatetime: '2026-01-02 09:00:00', valueNumeric: 2 }],
        },
      ],
    });

    expect(rows.map((r) => r.test)).toEqual(['Parent', 'Child']);
  });

  it('de-duplicates a concept repeated across branches', () => {
    const obs = [{ obsDatetime: '2026-01-02 09:00:00', valueNumeric: 1 }];
    const rows = flattenObsTree({
      display: 'Outer',
      subSets: [
        { conceptId: 5, display: 'Repeated', obs },
        { conceptId: 5, display: 'Repeated', obs },
      ],
    });

    expect(rows).toHaveLength(1);
  });

  it('stops descending past the depth cap without throwing', () => {
    let node: any = {
      conceptId: 999,
      display: 'Deepest',
      obs: [{ obsDatetime: '2026-01-02 09:00:00', valueNumeric: 1 }],
    };
    for (let i = 0; i < 8; i++) {
      node = { display: `Level ${i}`, subSets: [node] };
    }

    expect(() => flattenObsTree(node)).not.toThrow();
    expect(flattenObsTree(node)).toEqual([]);
  });

  it('stops at the node budget on a pathologically wide tree', () => {
    const subSets = Array.from({ length: 900 }, (_, i) => ({
      conceptId: i,
      display: `Analyte ${i}`,
      obs: [{ obsDatetime: '2026-01-02 09:00:00', valueNumeric: i }],
    }));

    const rows = flattenObsTree({ display: 'Huge panel', subSets });

    expect(rows.length).toBeLessThan(900);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('handles the real LABORATORY TESTS tree: same-day only, deduped, panels attributed', () => {
    // Trimmed from an actual server payload: a duplicated concept across three
    // branches, four levels of nesting, obs on two different days, empty-obs
    // siblings, and a node with no bounds at all.
    const hb = (day: string) => [
      { obsDatetime: `${day} 12:33:46`, valueNumeric: 14.0 },
    ];
    const tree = {
      display: 'LABORATORY TESTS',
      subSets: [
        {
          display: 'COMPLETE BLOOD COUNT',
          subSets: [
            {
              conceptId: 1,
              display: 'HEMATOCRIT',
              units: '%',
              lowNormal: 36.1,
              hiNormal: 50.3,
              lowAbsolute: 0.0,
              hiAbsolute: 250.0,
              obs: [
                { obsDatetime: '2026-08-03 12:33:46', valueNumeric: 200.0 },
              ],
            },
            // Same concept as the standalone and antenatal copies below — must appear once.
            {
              conceptId: 2,
              display: 'HEMOGLOBIN',
              units: 'g/dL',
              lowNormal: 11.0,
              hiNormal: 18.0,
              obs: hb('2026-08-03'),
            },
            // Ordered but unresulted sibling must contribute nothing.
            { conceptId: 3, display: 'PLATELETCRIT', units: '%', obs: [] },
          ],
        },
        {
          display: 'RENAL FUNCTION BLOOD TEST',
          subSets: [
            {
              display: 'SERUM ELECTROLYTES',
              subSets: [
                {
                  conceptId: 4,
                  display: 'SERUM SODIUM',
                  units: 'mmol/L',
                  lowNormal: 132.0,
                  hiNormal: 145.0,
                  obs: [
                    { obsDatetime: '2026-08-03 11:15:05', valueNumeric: 150.0 },
                  ],
                },
              ],
            },
            // No bounds anywhere — must be unassessable rather than claimed normal.
            {
              conceptId: 5,
              display: 'UREA MEASUREMENT (CALCULATED)',
              obs: [{ obsDatetime: '2026-08-03 11:15:05', valueNumeric: 599 }],
            },
          ],
        },
        // A different day — the whole point of the same-day filter.
        {
          conceptId: 2,
          display: 'HEMOGLOBIN',
          units: 'g/dL',
          obs: hb('2026-06-02'),
        },
        {
          display: 'ANTENATAL CARE  PROFILE',
          subSets: [
            {
              conceptId: 2,
              display: 'HEMOGLOBIN',
              units: 'g/dL',
              obs: hb('2026-06-02'),
            },
          ],
        },
      ],
    };

    const rows = flattenObsTree(tree, { window });
    const byTest = new Map(rows.map((r) => [r.test, r]));

    expect(rows.map((r) => r.test).sort()).toEqual([
      'HEMATOCRIT',
      'HEMOGLOBIN',
      'SERUM SODIUM',
      'UREA MEASUREMENT (CALCULATED)',
    ]);

    expect(byTest.get('HEMATOCRIT')).toMatchObject({
      value: '200',
      units: '%',
      range: '36.1 – 50.3',
      interpretation: 'HIGH',
      panel: 'COMPLETE BLOOD COUNT',
    });
    expect(byTest.get('HEMOGLOBIN')).toMatchObject({
      value: '14',
      interpretation: 'NORMAL',
      panel: 'COMPLETE BLOOD COUNT',
    });
    expect(byTest.get('SERUM SODIUM')).toMatchObject({
      interpretation: 'HIGH',
      panel: 'SERUM ELECTROLYTES',
    });
    expect(byTest.get('UREA MEASUREMENT (CALCULATED)')).toMatchObject({
      value: '599',
      interpretation: '--',
      range: undefined,
      units: undefined,
    });
  });

  it('prefers the node bounds — the only source of bounds a raw schema has (rule 6 collapses here)', () => {
    const rows = flattenObsTree({
      conceptId: 1,
      display: 'HEMATOCRIT',
      lowNormal: 36.1,
      hiNormal: 50.3,
      obs: [{ obsDatetime: '2026-08-03 11:15:05', valueNumeric: 200 }],
    });

    expect(rows[0]).toMatchObject({
      interpretation: 'HIGH',
      range: '36.1 – 50.3',
    });
  });
});

/* ------------------------------------------------------------------ *
 * utils/visit-window.helper.ts
 * ------------------------------------------------------------------ */

describe('isoDatePart', () => {
  it('extracts the calendar date from a raw MySQL datetime string', () => {
    expect(isoDatePart('2026-08-03 07:00:00')).toBe('2026-08-03');
  });

  it('extracts the calendar date from an already-formatted wire datetime', () => {
    expect(isoDatePart('2026-08-03T07:00:00.000+0300')).toBe('2026-08-03');
  });

  it('returns undefined for absent input', () => {
    expect(isoDatePart(undefined)).toBeUndefined();
    expect(isoDatePart(null)).toBeUndefined();
  });
});

describe('toOpenMrsDatetime', () => {
  it('formats a raw MySQL datetime as the OpenMRS wire format', () => {
    expect(toOpenMrsDatetime('2026-08-03 07:00:00')).toBe(
      '2026-08-03T07:00:00.000+0300',
    );
  });

  it('returns undefined for absent input', () => {
    expect(toOpenMrsDatetime(null)).toBeUndefined();
    expect(toOpenMrsDatetime(undefined)).toBeUndefined();
  });
});

describe('pickAnchorVisit', () => {
  it('prefers the most recent still-open visit over a more recent closed one', () => {
    const closedNewer = visitRow({
      uuid: 'v-closed',
      dateStarted: '2026-08-03 09:00:00',
      dateStopped: '2026-08-03 10:00:00',
    });
    const openOlder = visitRow({
      uuid: 'v-open',
      dateStarted: '2026-08-03 07:00:00',
      dateStopped: null,
    });

    expect(pickAnchorVisit([closedNewer, openOlder])).toBe(openOlder);
  });

  it('falls back to the most recent visit when none are open', () => {
    const a = visitRow({ uuid: 'a', dateStopped: '2026-08-03 10:00:00' });
    const b = visitRow({ uuid: 'b', dateStopped: '2026-08-03 11:00:00' });

    expect(pickAnchorVisit([a, b])).toBe(a);
  });

  it('returns undefined for an empty list', () => {
    expect(pickAnchorVisit([])).toBeUndefined();
  });
});

describe('sameDayVisits', () => {
  it('keeps only visits started on the anchor calendar day', () => {
    const anchor = visitRow({
      uuid: 'anchor',
      dateStarted: '2026-08-03 07:00:00',
    });
    const sameDay = visitRow({
      uuid: 'same-day',
      dateStarted: '2026-08-03 14:00:00',
    });
    const otherDay = visitRow({
      uuid: 'other-day',
      dateStarted: '2026-08-02 09:00:00',
    });

    expect(
      sameDayVisits([anchor, sameDay, otherDay], anchor).map((v) => v.uuid),
    ).toEqual(['anchor', 'same-day']);
  });
});

describe('visitWindow', () => {
  it('spans the earliest start to the latest stop when every visit is closed', () => {
    const window = visitWindow([
      visitRow({
        dateStarted: '2026-08-03 14:00:00',
        dateStopped: '2026-08-03 15:00:00',
      }),
      visitRow({
        dateStarted: '2026-08-03 07:00:00',
        dateStopped: '2026-08-03 08:30:00',
      }),
    ]);

    expect(window.startDatetime).toBe('2026-08-03T07:00:00.000+0300');
    expect(window.stopDatetime).toBe('2026-08-03T15:00:00.000+0300');
  });

  it('stays open when any merged visit is still open', () => {
    const window = visitWindow([
      visitRow({
        dateStarted: '2026-08-03 07:00:00',
        dateStopped: '2026-08-03 08:30:00',
      }),
      visitRow({ dateStarted: '2026-08-03 14:00:00', dateStopped: null }),
    ]);

    expect(window.startDatetime).toBe('2026-08-03T07:00:00.000+0300');
    expect(window.stopDatetime).toBeUndefined();
  });
});

describe('labWindowBounds', () => {
  it('bounds a closed window to the day after stop, exclusive', () => {
    expect(
      labWindowBounds({
        startDatetime: '2026-08-01T09:00:00.000+0300',
        stopDatetime: '2026-08-05T17:00:00.000+0300',
      }),
    ).toEqual(['2026-08-01 00:00:00', '2026-08-06 00:00:00']);
  });

  it('uses a far-future upper bound for an open window', () => {
    expect(
      labWindowBounds({ startDatetime: '2026-08-01T09:00:00.000+0300' }),
    ).toEqual(['2026-08-01 00:00:00', '2099-01-01 00:00:00']);
  });

  it('rolls over the month and year correctly', () => {
    expect(
      labWindowBounds({
        startDatetime: '2026-01-01T00:00:00.000+0300',
        stopDatetime: '2025-12-31T23:00:00.000+0300',
      }),
    ).toEqual(['2026-01-01 00:00:00', '2026-01-01 00:00:00']);
  });
});

/* ------------------------------------------------------------------ *
 * case-summary.service.ts — pure mapping functions
 * ------------------------------------------------------------------ */

describe('mapDemographics', () => {
  it('concatenates the name and picks identifiers by type uuid, with a preferred fallback', () => {
    const anchor = visitRow({
      givenName: 'Jane',
      middleName: null,
      familyName: 'Doe',
      gender: 'F',
      birthdate: '1990-05-01',
    });
    const identifiers: Array<IdentifierRow> = [
      {
        identifier: 'OP-100',
        identifierTypeUuid: null,
        identifierTypeName: 'OpenMRS ID',
        preferred: 1,
      },
      {
        identifier: '12345678',
        identifierTypeUuid: '58a47054-1359-11df-a1f1-0026b9348838',
        identifierTypeName: 'National ID',
        preferred: 0,
      },
      {
        identifier: 'CR-999',
        identifierTypeUuid: 'e88dc246-3614-4ee3-8141-1f2a83054e72',
        identifierTypeName: 'Client Registry Number',
        preferred: 0,
      },
    ];

    const demographics = mapDemographics(anchor, identifiers);

    expect(demographics.name).toBe('Jane Doe');
    expect(demographics.gender).toBe('F');
    expect(demographics.patientId).toBe('OP-100');
    expect(demographics.nationalId).toBe('12345678');
    expect(demographics.crNumber).toBe('CR-999');
  });

  it('falls back to matching by display name when the identifier type uuid is absent', () => {
    const demographics = mapDemographics(visitRow(), [
      {
        identifier: 'CR-999',
        identifierTypeUuid: null,
        identifierTypeName: 'Client Registry Number',
        preferred: 0,
      },
    ]);

    expect(demographics.crNumber).toBe('CR-999');
  });

  it('computes a whole-years age from birthdate', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-03T12:00:00Z'));
    try {
      expect(
        mapDemographics(visitRow({ birthdate: '1990-01-01' }), []).age,
      ).toBe('36');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('isDrugOrderActive', () => {
  const now = Date.parse('2026-02-01T00:00:00.000Z');

  it('treats an open-ended order as active', () => {
    expect(isDrugOrderActive({}, now)).toBe(true);
  });

  it('treats stopped and discontinued orders as inactive', () => {
    expect(isDrugOrderActive({ dateStopped: '2026-01-15 00:00:00' }, now)).toBe(
      false,
    );
    expect(isDrugOrderActive({ action: 'DISCONTINUE' }, now)).toBe(false);
  });

  it('treats an order past its autoExpireDate as inactive, but not one still in window', () => {
    expect(
      isDrugOrderActive({ autoExpireDate: '2026-01-20 00:00:00' }, now),
    ).toBe(false);
    expect(
      isDrugOrderActive({ autoExpireDate: '2026-03-20 00:00:00' }, now),
    ).toBe(true);
  });
});

describe('mapDrugOrder', () => {
  it('maps the dosing fields', () => {
    expect(
      mapDrugOrder(
        orderRow({
          dateActivated: '2026-01-01 08:00:00',
          drugName: 'Amoxicillin 500mg',
          drugStrength: '500mg',
          dose: 500,
          doseUnitsName: 'mg',
          routeName: 'Oral',
          frequencyName: 'Twice daily',
          duration: 5,
          durationUnitsName: 'Days',
          instructions: 'After food',
        }),
      ),
    ).toEqual({
      date: '2026-01-01T08:00:00.000+0300',
      drug: 'Amoxicillin 500mg',
      dose: '500 mg',
      route: 'Oral',
      frequency: 'Twice daily',
      duration: '5 Days',
      instructions: 'After food',
    });
  });

  it('appends the strength only when the drug name does not already include it', () => {
    expect(
      mapDrugOrder(orderRow({ drugName: 'Amoxicillin', drugStrength: '500mg' }))
        .drug,
    ).toBe('Amoxicillin 500mg');
    expect(
      mapDrugOrder(
        orderRow({ drugName: 'Amoxicillin 500mg', drugStrength: '500mg' }),
      ).drug,
    ).toBe('Amoxicillin 500mg');
  });

  it('falls back to the concept name when the order has no drug', () => {
    expect(
      mapDrugOrder(
        orderRow({ drugName: null, conceptName: 'Unspecified antibiotic' }),
      ).drug,
    ).toBe('Unspecified antibiotic');
  });

  it('omits dose and duration when the value is absent, rather than printing a bare unit', () => {
    const medication = mapDrugOrder(
      orderRow({
        drugName: 'Ibuprofen',
        doseUnitsName: 'mg',
        durationUnitsName: 'Days',
      }),
    );

    expect(medication.dose).toBeUndefined();
    expect(medication.duration).toBeUndefined();
  });
});

describe('isTestOrderType', () => {
  // The real /ordertype list from the reference app's server, verbatim. Six of the
  // eight are modelled as a bare `org.openmrs.Order`, which is exactly why
  // `javaClassName` is the primary discriminator — display matching alone cannot
  // separate them.
  const serverOrderTypes = [
    {
      uuid: '53eb466e-1359-11df-a1f1-0026b9348838',
      display: 'Drug',
      javaClassName: 'org.openmrs.DrugOrder',
      isTest: false,
    },
    {
      uuid: '53eb4768-1359-11df-a1f1-0026b9348838',
      display: 'Test',
      javaClassName: 'org.openmrs.TestOrder',
      isTest: true,
    },
    {
      uuid: 'ff4485a4-f071-4423-aeb2-db6efce52b83',
      display: 'Radiology Order',
      javaClassName: 'org.openmrs.Order',
      isTest: false,
    },
    {
      uuid: '58ea528c-8f62-45f0-86a2-f7d1327b8c56',
      display: 'Medical Supplies Order',
      javaClassName: 'org.openmrs.Order',
      isTest: false,
    },
    {
      uuid: '2315ab24-9a4e-4b36-b189-8e74d2c77394',
      display: 'Procedure Order',
      javaClassName: 'org.openmrs.Order',
      isTest: false,
    },
    {
      uuid: '2da15461-81db-43bc-a2c0-853741bece90',
      display: 'Consultation Cash Order',
      javaClassName: 'org.openmrs.Order',
      isTest: false,
    },
    {
      uuid: 'a6a1b98c-ceaf-4481-ae61-67251e43a128',
      display: 'Consultation SHA order',
      javaClassName: 'org.openmrs.Order',
      isTest: false,
    },
    {
      uuid: '7d1442cc-4fa2-4407-9100-40f0c1c247c8',
      display: 'SHA Intervention Switch',
      javaClassName: 'org.openmrs.Order',
      isTest: false,
    },
  ];

  it.each(serverOrderTypes)(
    'classifies the real "$display" order type as isTest=$isTest',
    ({ isTest, ...orderType }) => {
      expect(isTestOrderType(orderType)).toBe(isTest);
    },
  );

  it('exports the real Test Order uuid, not a guess', () => {
    expect(TEST_ORDER_TYPE_UUID).toBe('53eb4768-1359-11df-a1f1-0026b9348838');
  });

  it('accepts by javaClassName even when uuid and display are unfamiliar', () => {
    expect(
      isTestOrderType({
        uuid: 'other',
        display: 'Investigation',
        javaClassName: 'org.openmrs.TestOrder',
      }),
    ).toBe(true);
  });

  it('falls back to uuid, then display, when javaClassName is absent', () => {
    expect(isTestOrderType({ uuid: TEST_ORDER_TYPE_UUID })).toBe(true);
    expect(
      isTestOrderType({ uuid: 'some-other-uuid', display: 'Lab Order' }),
    ).toBe(true);
    expect(isTestOrderType({ display: 'Laboratory Order' })).toBe(true);
  });

  it('does not let a known non-test java class fall through to display matching', () => {
    expect(
      isTestOrderType({
        display: 'Some test-like label',
        javaClassName: 'org.openmrs.Order',
      }),
    ).toBe(false);
  });

  it('never accepts a drug order, by java class, uuid, or display', () => {
    expect(isTestOrderType({ javaClassName: 'org.openmrs.DrugOrder' })).toBe(
      false,
    );
    expect(isTestOrderType({ uuid: DRUG_ORDER_TYPE_UUID })).toBe(false);
    expect(isTestOrderType({ display: 'Medication Order' })).toBe(false);
  });

  it('rejects unrelated order types and missing input', () => {
    expect(isTestOrderType({ display: 'Referral Order' })).toBe(false);
    expect(isTestOrderType(undefined)).toBe(false);
  });
});

describe('mapTestOrders', () => {
  const testType = {
    orderTypeUuid: TEST_ORDER_TYPE_UUID,
    orderTypeName: 'Test',
    javaClassName: 'org.openmrs.TestOrder',
  };

  it('maps test orders and de-dupes by order uuid', () => {
    const orders = mapTestOrders([
      orderRow({
        uuid: 'o1',
        orderNumber: 'ORD-1',
        dateActivated: '2026-01-01 08:00:00',
        conceptId: 10,
        conceptName: 'RANDOM BLOOD SUGAR',
        action: 'NEW',
        fulfillerStatus: 'COMPLETED',
        ...testType,
      }),
      orderRow({
        uuid: 'o1',
        conceptId: 10,
        conceptName: 'RANDOM BLOOD SUGAR',
        ...testType,
      }),
    ]);

    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      uuid: 'o1',
      conceptId: 10,
      test: 'RANDOM BLOOD SUGAR',
      pending: true,
      action: 'NEW',
      fulfillerStatus: 'COMPLETED',
      results: [],
    });
  });

  it('skips discontinued and non-test orders, without needing a separate visit-scope filter', () => {
    // Unlike the frontend's `mapTestOrders`, there is no `orderBelongsToVisit` check:
    // every row already comes from a `visit.uuid IN (?)` join.
    const orders = mapTestOrders([
      orderRow({
        uuid: 'o1',
        action: 'DISCONTINUE',
        conceptId: 1,
        ...testType,
      }),
      orderRow({ uuid: 'o2', conceptId: 2 }), // default drug order fixture
      orderRow({ uuid: 'o3', conceptId: 3, conceptName: 'Kept', ...testType }),
    ]);

    expect(orders.map((o) => o.uuid)).toEqual(['o3']);
  });
});

describe('testOrderConceptIds', () => {
  it('de-duplicates concept ids across orders', () => {
    expect(
      testOrderConceptIds([
        { uuid: 'o1', conceptId: 1, test: 'A', results: [], pending: true },
        {
          uuid: 'o2',
          conceptId: 1,
          test: 'A again',
          results: [],
          pending: true,
        },
        { uuid: 'o3', conceptId: 2, test: 'B', results: [], pending: true },
      ]),
    ).toEqual([1, 2]);
  });
});

describe('buildConceptTree', () => {
  const members: Array<ConceptSetMemberRow> = [
    {
      conceptId: 1,
      parentConceptId: null,
      depth: 0,
      display: 'FULL HAEMOGRAM',
      units: null,
      lowAbsolute: null,
      lowCritical: null,
      lowNormal: null,
      hiNormal: null,
      hiCritical: null,
      hiAbsolute: null,
    },
    {
      conceptId: 2,
      parentConceptId: 1,
      depth: 1,
      display: 'Haemoglobin',
      units: 'g/dL',
      lowAbsolute: null,
      lowCritical: null,
      lowNormal: 13,
      hiNormal: 17,
      hiCritical: null,
      hiAbsolute: null,
    },
    {
      conceptId: 3,
      parentConceptId: 1,
      depth: 1,
      display: 'White cell count',
      units: '10^9/L',
      lowAbsolute: null,
      lowCritical: null,
      lowNormal: 4,
      hiNormal: 11,
      hiCritical: null,
      hiAbsolute: null,
    },
  ];

  it('roots the tree at the given concept and nests its children', () => {
    const tree = buildConceptTree(1, members, new Map());

    expect(tree?.display).toBe('FULL HAEMOGRAM');
    expect(tree?.subSets?.map((n) => n.display)).toEqual([
      'Haemoglobin',
      'White cell count',
    ]);
  });

  it('attaches obs by concept id', () => {
    const obsByConcept = new Map([
      [2, [{ obsDatetime: '2026-01-02 09:00:00', valueNumeric: 14 }]],
    ]);
    const tree = buildConceptTree(1, members, obsByConcept);

    expect(tree?.subSets?.[0].obs).toHaveLength(1);
  });

  it('returns undefined when the root concept has no member row', () => {
    expect(buildConceptTree(999, members, new Map())).toBeUndefined();
  });
});

describe('buildEncounters', () => {
  it('groups obs under their encounter, dropping blank values', () => {
    const encounters = buildEncounters(
      [
        {
          encounterId: 1,
          uuid: 'enc-1',
          encounterDatetime: '2026-01-01 08:10:00',
          encounterTypeUuid: 'et-1',
          encounterTypeName: 'GENCONSULTATION',
          locationName: 'Location Test',
          providerDisplay: 'Dr Test',
        },
      ],
      [
        {
          encounterId: 1,
          conceptName: 'TEMPERATURE (C)',
          valueNumeric: 37.0,
          valueText: null,
          valueDatetime: null,
          valueCodedName: null,
        },
        {
          encounterId: 1,
          conceptName: 'BLANK FIELD',
          valueNumeric: null,
          valueText: '   ',
          valueDatetime: null,
          valueCodedName: null,
        },
      ],
    );

    expect(encounters).toHaveLength(1);
    expect(encounters[0]).toMatchObject({
      uuid: 'enc-1',
      encounterType: 'GENCONSULTATION',
      location: 'Location Test',
      provider: 'Dr Test',
    });
    expect(encounters[0].obs).toEqual([
      { label: 'TEMPERATURE (C)', value: '37' },
    ]);
  });
});

describe('buildVitalsFromEncounters', () => {
  it('picks the most recent value per vital and combines systolic/diastolic into blood pressure', () => {
    const vitals = buildVitalsFromEncounters([
      {
        uuid: 'enc-1',
        encounterDatetime: '2026-01-01T08:00:00.000+0300',
        obs: [
          { label: 'TEMPERATURE (C)', value: '36.5' },
          { label: 'SYSTOLIC', value: '120' },
          { label: 'DIASTOLIC', value: '80' },
        ],
      },
      {
        uuid: 'enc-2',
        encounterDatetime: '2026-01-02T08:00:00.000+0300',
        obs: [
          { label: 'TEMPERATURE (C)', value: '37.2' },
          { label: 'TRIAGE EARLY WARNING SCORE', value: '1' },
        ],
      },
    ]);

    expect(vitals.temperature).toBe('37.2');
    expect(vitals.bloodPressure).toBe('120/80 mmHg');
    expect(vitals.tewScore).toBe('1');
  });

  it('leaves every vital undefined when nothing was recorded this visit', () => {
    const vitals = buildVitalsFromEncounters([{ uuid: 'enc-1', obs: [] }]);

    expect(Object.values(vitals).every((value) => value === undefined)).toBe(
      true,
    );
  });
});

describe('buildEncounterNotes', () => {
  it('groups non-vital obs per encounter and drops encounters with none', () => {
    const notes = buildEncounterNotes([
      {
        uuid: 'enc-1',
        encounterType: 'POC OPD Triage',
        encounterDatetime: '2026-01-01T08:00:00.000+0300',
        obs: [
          { label: 'TEMPERATURE (C)', value: '37.0' },
          { label: 'CHIEF COMPLAINT, DETAILED', value: 'headache' },
        ],
      },
      {
        uuid: 'enc-2',
        encounterDatetime: '2026-01-01T09:00:00.000+0300',
        obs: [{ label: 'PULSE', value: '80' }],
      },
    ]);

    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      encounterUuid: 'enc-1',
      encounterType: 'POC OPD Triage',
    });
    expect(notes[0].fields).toEqual([
      { label: 'CHIEF COMPLAINT, DETAILED', value: 'headache' },
    ]);
  });
});

describe('buildInpatientDetails', () => {
  it('returns undefined when there is no ADT encounter', () => {
    expect(
      buildInpatientDetails([
        { uuid: 'enc-1', encounterTypeUuid: 'some-other-type', obs: [] },
      ]),
    ).toBeUndefined();
  });

  it('derives admission, ward, doctor, and discharge from ADT encounters', () => {
    const details = buildInpatientDetails([
      {
        uuid: 'enc-admit',
        encounterDatetime: '2026-01-01T08:00:00.000+0300',
        encounterTypeUuid: AdtEncounterTypeUuids.ADMIT_ENCOUNTER_TYPE_UUID,
        location: 'Male Ward',
        provider: 'Dr. Smith',
        obs: [],
      },
      {
        uuid: 'enc-discharge',
        encounterDatetime: '2026-01-03T08:00:00.000+0300',
        encounterTypeUuid: AdtEncounterTypeUuids.DISCHARGE_ENCOUNTER_TYPE_UUID,
        location: 'Male Ward',
        provider: 'Dr. Smith',
        obs: [],
      },
    ]);

    expect(details).toEqual({
      admissionDate: '2026-01-01T08:00:00.000+0300',
      ward: 'Male Ward',
      doctor: 'Dr. Smith',
      status: 'Discharged',
      dischargeDate: '2026-01-03T08:00:00.000+0300',
    });
  });
});

describe('mapConditionEntry', () => {
  it('maps a diagnosis row, treating rank 1 as primary', () => {
    expect(
      mapConditionEntry({
        conceptName: 'Secondary hypertension',
        certainty: 'confirmed',
        dxRank: 1,
        onsetDate: '2026-07-21 11:10:48',
        icd11Code: 'BA04',
      }),
    ).toEqual({
      code: 'BA04',
      description: 'Secondary hypertension',
      certainty: 'confirmed',
      primary: true,
      onsetDate: '2026-07-21T11:10:48.000+0300',
    });
  });

  it('treats a non-1 or absent rank as non-primary and leaves code unset without a mapping', () => {
    expect(
      mapConditionEntry({
        conceptName: 'Suspected dengue',
        certainty: null,
        dxRank: null,
        onsetDate: null,
        icd11Code: null,
      }),
    ).toEqual({
      code: undefined,
      description: 'Suspected dengue',
      certainty: undefined,
      primary: false,
      onsetDate: undefined,
    });
  });
});

describe('mapAllergy', () => {
  it('maps substance, severity, and combined reactions', () => {
    expect(
      mapAllergy({
        substance: 'HEPARIN',
        severity: 'Severe',
        reactions: 'ANEMIA, RASH',
      }),
    ).toEqual({
      substance: 'HEPARIN',
      criticality: 'Severe',
      reaction: 'ANEMIA, RASH',
    });
  });
});

describe('buildSoapNote', () => {
  const note = (
    encounterType: string,
    fields: Array<{ label: string; value: string }>,
  ) => ({
    encounterUuid: 'enc-1',
    encounterType,
    datetime: '2026-08-04T09:53:51.000+0300',
    fields,
  });

  it('categorizes fields by label into Subjective, Objective, Assessment, and Plan', () => {
    const soapNote = buildSoapNote({
      clinicalNotes: [
        note('GENCONSULTATION', [
          { label: 'CHIEF COMPLAINT', value: 'HEADACHE' },
          {
            label: 'PHYSICAL EXAM NOTE, FREETEXT',
            value: 'Patient alert and oriented.',
          },
          { label: 'DIAGNOSIS CATEGORY', value: 'NEW' },
          { label: 'THERAPEUTIC PLAN NOTES', value: 'Admit for observation' },
        ]),
      ],
      vitals: {},
      conditions: [],
      medications: [],
      labOrders: [],
    });

    expect(soapNote.subjective).toBe('Chief Complaint: HEADACHE.');
    expect(soapNote.objective).toBe(
      'Physical Exam Note, Freetext: Patient alert and oriented.',
    );
    expect(soapNote.assessment).toBe('Diagnosis Category: NEW.');
    expect(soapNote.plan).toBe('Therapeutic Plan Notes: Admit for observation.');
  });

  it('excludes ORDER-encounter notes entirely — that data is already in labOrders', () => {
    const soapNote = buildSoapNote({
      clinicalNotes: [
        note('ORDER', [{ label: 'SERUM CREATININE', value: '11000' }]),
      ],
      vitals: {},
      conditions: [],
      medications: [],
      labOrders: [],
    });

    expect(soapNote.subjective).toBeUndefined();
    expect(soapNote.objective).toBeUndefined();
  });

  it('summarizes vitals and lab results under Objective', () => {
    const soapNote = buildSoapNote({
      clinicalNotes: [],
      vitals: { temperature: '39', pulse: '100', bloodPressure: '130/90 mmHg' },
      conditions: [],
      medications: [],
      labOrders: [
        {
          uuid: 'ord-1',
          conceptId: 1,
          test: 'SERUM CREATININE',
          pending: false,
          results: [
            {
              test: 'SERUM CREATININE',
              value: '11000',
              units: 'µmol/L',
              interpretation: 'HIGH',
            },
          ],
        },
        {
          uuid: 'ord-2',
          conceptId: 2,
          test: 'COMPLETE BLOOD COUNT',
          pending: true,
          results: [],
        },
      ],
    });

    expect(soapNote.objective).toContain(
      'Temp 39°C, Pulse 100 bpm, BP 130/90 mmHg.',
    );
    expect(soapNote.objective).toContain(
      'SERUM CREATININE: SERUM CREATININE 11000 µmol/L (HIGH)',
    );
    expect(soapNote.objective).toContain('COMPLETE BLOOD COUNT pending');
  });

  it('numbers conditions under Assessment, noting certainty and primary', () => {
    const soapNote = buildSoapNote({
      clinicalNotes: [],
      vitals: {},
      conditions: [
        {
          code: 'GB60.0',
          description: 'Acute kidney failure, stage 1',
          certainty: 'CONFIRMED',
          primary: true,
        },
        {
          code: '1F40.Z',
          description: 'Malaria',
          certainty: 'CONFIRMED',
          primary: false,
        },
      ],
      medications: [],
      labOrders: [],
    });

    expect(soapNote.assessment).toBe(
      '1. Acute kidney failure, stage 1 (GB60.0) — confirmed, primary. 2. Malaria (1F40.Z) — confirmed.',
    );
  });

  it('lists medications and pending orders under Plan', () => {
    const soapNote = buildSoapNote({
      clinicalNotes: [],
      vitals: {},
      conditions: [],
      medications: [
        {
          drug: 'ENALAPRIL 2.5mg TAB',
          dose: '1 TABLET',
          frequency: 'ONCE A DAY',
          duration: '30 DAYS',
        },
      ],
      labOrders: [
        {
          uuid: 'ord-2',
          conceptId: 2,
          test: 'COMPLETE BLOOD COUNT',
          pending: true,
          results: [],
        },
      ],
    });

    expect(soapNote.plan).toBe(
      'Medications: ENALAPRIL 2.5mg TAB 1 TABLET ONCE A DAY for 30 DAYS. Pending: COMPLETE BLOOD COUNT.',
    );
  });

  it('surfaces an unrecognised label under Objective as "Other notes" rather than dropping it', () => {
    const soapNote = buildSoapNote({
      clinicalNotes: [
        note('GENCONSULTATION', [{ label: 'SOME UNMAPPED FIELD', value: 'x' }]),
      ],
      vitals: {},
      conditions: [],
      medications: [],
      labOrders: [],
    });

    expect(soapNote.objective).toBe('Other notes: Some Unmapped Field: x.');
  });

  it('omits every section when there is nothing to report', () => {
    const soapNote = buildSoapNote({
      clinicalNotes: [],
      vitals: {},
      conditions: [],
      medications: [],
      labOrders: [],
    });

    expect(soapNote).toEqual({
      subjective: undefined,
      objective: undefined,
      assessment: undefined,
      plan: undefined,
    });
  });
});

/* ------------------------------------------------------------------ *
 * CaseSummaryService — orchestration, SQL parameters, error handling
 * ------------------------------------------------------------------ */

describe('CaseSummaryService', () => {
  let service: CaseSummaryService;
  const amrsDataSource = { query: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaseSummaryService,
        LabResultHelper,
        VisitWindowHelper,
        SoapNoteHelper,
        {
          provide: getDataSourceToken(AMRS_CONNECTION),
          useValue: amrsDataSource,
        },
      ],
    }).compile();

    service = module.get(CaseSummaryService);
  });

  type QueryFixtures = {
    visits?: Array<VisitRow>;
    identifiers?: Array<IdentifierRow>;
    encounters?: Array<EncounterRow>;
    encounterObs?: Array<EncounterObsRow>;
    orders?: Array<OrderRow>;
    diagnoses?: Array<DiagnosisRow>;
    allergies?: Array<AllergyRow>;
    conceptTree?: Array<ConceptSetMemberRow>;
    labObs?: Array<LabObsRow>;
  };

  function mockQuery(fixtures: QueryFixtures) {
    amrsDataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM patient_identifier'))
        return fixtures.identifiers ?? [];
      if (sql.includes('encounter_provider')) return fixtures.encounters ?? [];
      if (sql.includes('o.person_id =')) return fixtures.labObs ?? [];
      if (sql.includes('e.encounter_id = o.encounter_id'))
        return fixtures.encounterObs ?? [];
      if (sql.includes('FROM orders ord')) return fixtures.orders ?? [];
      if (sql.includes('FROM encounter_diagnosis'))
        return fixtures.diagnoses ?? [];
      if (sql.includes('FROM allergy a')) return fixtures.allergies ?? [];
      if (sql.includes('WITH RECURSIVE members'))
        return fixtures.conceptTree ?? [];
      if (sql.includes('FROM visit v')) return fixtures.visits ?? [];
      throw new Error(`Unmocked SQL: ${sql}`);
    });
  }

  it('throws NotFoundException when the patient has no visits', async () => {
    mockQuery({ visits: [] });

    await expect(
      service.getVisitCaseSummary({
        patientUuid: 'patient-1',
        locationUuid: 'loc-1',
      }),
    ).rejects.toMatchObject({
      status: 404,
      message: 'No visit found for this patient.',
    });
  });

  it('wraps an unexpected database error as a 502, not a 500', async () => {
    amrsDataSource.query.mockRejectedValue(new Error('connect ETIMEDOUT'));

    await expect(
      service.getVisitCaseSummary({
        patientUuid: 'patient-1',
        locationUuid: 'loc-1',
      }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it('assembles a summary for a specific visit, scoping diagnoses and allergies to the patient, not the visit', async () => {
    mockQuery({
      visits: [visitRow()],
      encounters: [
        {
          encounterId: 1,
          uuid: 'enc-1',
          encounterDatetime: '2026-08-03 07:10:00',
          encounterTypeUuid: 'et-1',
          encounterTypeName: 'GENCONSULTATION',
          locationName: null,
          providerDisplay: null,
        },
      ],
      encounterObs: [
        {
          encounterId: 1,
          conceptName: 'TEMPERATURE (C)',
          valueNumeric: 37,
          valueText: null,
          valueDatetime: null,
          valueCodedName: null,
        },
      ],
      diagnoses: [
        {
          conceptName: 'Secondary hypertension',
          certainty: 'confirmed',
          dxRank: 1,
          onsetDate: null,
          icd11Code: 'BA04',
        },
      ],
      allergies: [
        { substance: 'HEPARIN', severity: null, reactions: 'ANEMIA' },
      ],
    });

    const summary = await service.getVisitCaseSummary({
      patientUuid: 'patient-1',
      visitUuid: 'visit-1',
      locationUuid: 'loc-1',
    });

    expect(summary.visit.uuid).toBe('visit-1');
    expect(summary.visitUuids).toEqual(['visit-1']);
    expect(summary.conditions).toEqual([
      {
        code: 'BA04',
        description: 'Secondary hypertension',
        certainty: 'confirmed',
        primary: true,
        onsetDate: undefined,
      },
    ]);
    expect(summary.allergies).toEqual([
      { substance: 'HEPARIN', criticality: undefined, reaction: 'ANEMIA' },
    ]);
    expect(summary.vitals.temperature).toBe('37');
    expect(summary.inpatientDetails).toBeUndefined();
    expect(summary.labResultsUnavailable).toBeUndefined();
    expect(summary.labOrders).toEqual([]);
    expect(summary.soapNote.assessment).toBe(
      '1. Secondary hypertension (BA04) — confirmed, primary.',
    );
    expect(summary.soapNote.objective).toBe('Vitals: Temp 37°C.');

    // rule 13: diagnoses/allergies are patient-level, never visit-scoped.
    const [, diagnosisParams] = amrsDataSource.query.mock.calls.find(
      ([sql]: [string]) => sql.includes('FROM encounter_diagnosis'),
    );
    expect(diagnosisParams).toEqual(['patient-1']);
    const [, allergyParams] = amrsDataSource.query.mock.calls.find(
      ([sql]: [string]) => sql.includes('FROM allergy a'),
    );
    expect(allergyParams).toEqual(['patient-1']);

    // asking for one visit must not fold in same-day neighbours.
    const [, visitParams] = amrsDataSource.query.mock.calls.find(
      ([sql]: [string]) => sql.includes('FROM visit v'),
    );
    expect(visitParams).toEqual(['visit-1']);
  });

  it('merges same-day visits and leaves the window open while any of them is still open', async () => {
    const morning = visitRow({
      uuid: 'visit-morning',
      dateStarted: '2026-08-03 07:00:00',
      dateStopped: '2026-08-03 08:30:00',
    });
    const afternoon = visitRow({
      uuid: 'visit-afternoon',
      dateStarted: '2026-08-03 14:00:00',
      dateStopped: null,
    });
    const yesterday = visitRow({
      uuid: 'visit-yesterday',
      dateStarted: '2026-08-02 09:00:00',
      dateStopped: '2026-08-02 10:00:00',
    });

    mockQuery({ visits: [afternoon, morning, yesterday] });

    const summary = await service.getVisitCaseSummary({
      patientUuid: 'patient-1',
      locationUuid: 'loc-1',
    });

    expect(summary.visitUuids.sort()).toEqual([
      'visit-afternoon',
      'visit-morning',
    ]);
    expect(summary.visit.startDatetime).toBe('2026-08-03T07:00:00.000+0300');
    expect(summary.visit.stopDatetime).toBeUndefined();

    const [, encounterParams] = amrsDataSource.query.mock.calls.find(
      ([sql]: [string]) => sql.includes('encounter_provider'),
    );
    expect(encounterParams).toEqual([['visit-afternoon', 'visit-morning']]);
  });

  it('resolves test orders to lab results end to end, keyed by concept id — no fuzzy pairing needed', async () => {
    mockQuery({
      visits: [visitRow()],
      orders: [
        orderRow({
          uuid: 'ord-rbs',
          conceptId: 55,
          conceptName: 'RANDOM BLOOD SUGAR',
          orderTypeUuid: TEST_ORDER_TYPE_UUID,
          orderTypeName: 'Test',
          javaClassName: 'org.openmrs.TestOrder',
          dateActivated: '2026-08-03 08:00:00',
          action: 'NEW',
          fulfillerStatus: 'COMPLETED',
        }),
      ],
      conceptTree: [
        {
          conceptId: 55,
          parentConceptId: null,
          depth: 0,
          display: 'RANDOM BLOOD SUGAR',
          units: 'mmol/L',
          lowAbsolute: null,
          lowCritical: null,
          lowNormal: 4,
          hiNormal: 7,
          hiCritical: null,
          hiAbsolute: null,
        },
      ],
      labObs: [
        {
          conceptId: 55,
          obsDatetime: '2026-08-03 10:00:00',
          valueNumeric: 9.1,
          valueText: null,
          valueCodedName: null,
        },
      ],
    });

    const summary = await service.getVisitCaseSummary({
      patientUuid: 'patient-1',
      visitUuid: 'visit-1',
      locationUuid: 'loc-1',
    });

    expect(summary.labOrders).toHaveLength(1);
    expect(summary.labOrders[0].pending).toBeUndefined();
    expect(summary.labOrders[0]).toMatchObject({
      action: 'NEW',
      fulfillerStatus: 'COMPLETED',
    });
    expect(summary.labOrders[0].results[0]).toMatchObject({
      test: 'RANDOM BLOOD SUGAR',
      value: '9.1',
      units: 'mmol/L',
      range: '4 – 7',
      interpretation: 'HIGH',
    });
  });

  it('flags results as unavailable when the lab query fails but orders exist, without failing the request', async () => {
    amrsDataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('WITH RECURSIVE members')) throw new Error('boom');
      if (sql.includes('FROM orders ord')) {
        return [
          orderRow({
            uuid: 'ord-rbs',
            conceptId: 55,
            conceptName: 'RANDOM BLOOD SUGAR',
            orderTypeUuid: TEST_ORDER_TYPE_UUID,
            orderTypeName: 'Test',
            javaClassName: 'org.openmrs.TestOrder',
          }),
        ];
      }
      if (sql.includes('FROM visit v')) return [visitRow()];
      return [];
    });

    const summary = await service.getVisitCaseSummary({
      patientUuid: 'patient-1',
      visitUuid: 'visit-1',
      locationUuid: 'loc-1',
    });

    expect(summary.labOrders).toHaveLength(1);
    expect(summary.labOrders[0].pending).toBe(true);
    expect(summary.labResultsUnavailable).toBe(true);
  });

  it('filters medications to active drug orders only', async () => {
    mockQuery({
      visits: [visitRow()],
      orders: [
        orderRow({ uuid: 'active', drugName: 'Amoxicillin 500mg' }),
        orderRow({
          uuid: 'stopped',
          drugName: 'Old drug',
          dateStopped: '2020-01-01 00:00:00',
        }),
      ],
    });

    const summary = await service.getVisitCaseSummary({
      patientUuid: 'patient-1',
      visitUuid: 'visit-1',
      locationUuid: 'loc-1',
    });

    expect(summary.medications.map((m) => m.drug)).toEqual([
      'Amoxicillin 500mg',
    ]);
  });

  it('omits interpretation on the wire for normal and unassessable results', async () => {
    mockQuery({
      visits: [visitRow()],
      orders: [
        orderRow({
          uuid: 'ord-1',
          conceptId: 1,
          conceptName: 'CBC',
          orderTypeUuid: TEST_ORDER_TYPE_UUID,
          orderTypeName: 'Test',
          javaClassName: 'org.openmrs.TestOrder',
        }),
      ],
      conceptTree: [
        {
          conceptId: 1,
          parentConceptId: null,
          depth: 0,
          display: 'HEMOGLOBIN',
          units: 'g/dL',
          lowAbsolute: null,
          lowCritical: null,
          lowNormal: 11,
          hiNormal: 18,
          hiCritical: null,
          hiAbsolute: null,
        },
      ],
      labObs: [
        {
          conceptId: 1,
          obsDatetime: '2026-08-03 08:00:00',
          valueNumeric: 14,
          valueText: null,
          valueCodedName: null,
        },
      ],
    });

    const summary = await service.getVisitCaseSummary({
      patientUuid: 'patient-1',
      visitUuid: 'visit-1',
      locationUuid: 'loc-1',
    });

    expect(summary.labOrders[0].results[0].interpretation).toBeUndefined();
  });
});
