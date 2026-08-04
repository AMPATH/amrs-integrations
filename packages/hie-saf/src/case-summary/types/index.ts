/**
 * `GET /case-summary` contracts, plus the raw-row and intermediate shapes the
 * service builds them from.
 *
 * `...Row` types are what `dataSource.query(sql, params)` returns for the AMRS
 * connection: every column is aliased in the SQL itself to the camelCase name
 * used here, so no separate snake_case -> camelCase mapping step exists.
 * Datetime columns come back as raw MySQL strings (`AMRS_CONNECTION` is
 * configured with `dateStrings: true`) — never a driver-parsed `Date` — so
 * calendar-day comparisons are exact string comparisons, never subject to the
 * Node process's timezone. See `utils/visit-window.helper.ts`.
 */

/* ------------------------------------------------------------------ *
 * Wire contract — the bare response body, per docs/case-summary-endpoint.md §3
 * ------------------------------------------------------------------ */

export type CaseSummaryLabInterpretation =
  | 'LOW'
  | 'HIGH'
  | 'CRITICALLY_LOW'
  | 'CRITICALLY_HIGH'
  | 'OFF_SCALE_LOW'
  | 'OFF_SCALE_HIGH'
  | 'NORMAL'
  | '--';

/** The subset of `CaseSummaryLabInterpretation` ever sent on the wire — `NORMAL` and `'--'` are omitted, not sent. */
export type CaseSummaryWireInterpretation = Exclude<
  CaseSummaryLabInterpretation,
  'NORMAL' | '--'
>;

export type CaseSummaryResponse = {
  visit: {
    uuid: string;
    display?: string;
    visitType?: string;
    startDatetime?: string;
    stopDatetime?: string;
  };
  visitUuids: string[];
  demographics: {
    name: string;
    birthDate?: string;
    gender?: string;
    age?: string;
    patientId?: string;
    nationalId?: string;
    crNumber?: string;
  };
  allergies: Array<{
    substance: string;
    criticality?: string;
    reaction?: string;
  }>;
  conditions: Array<{
    code?: string;
    description: string;
    certainty?: string;
    primary?: true;
    onsetDate?: string;
  }>;
  vitals: {
    temperature?: string;
    bloodPressure?: string;
    pulse?: string;
    respiratoryRate?: string;
    spo2?: string;
    height?: string;
    weight?: string;
    bmi?: string;
    tewScore?: string;
  };
  medications: Array<{
    date?: string;
    drug: string;
    dose?: string;
    route?: string;
    frequency?: string;
    duration?: string;
    instructions?: string;
  }>;
  clinicalNotes: Array<{
    encounterUuid: string;
    encounterType?: string;
    datetime?: string;
    fields: Array<{ label: string; value: string }>;
  }>;
  labOrders: Array<{
    uuid: string;
    test: string;
    orderNumber?: string;
    orderedDate?: string;
    pending?: true;
    /** OpenMRS `order_action` — e.g. `NEW`, `RENEW`, `DISCONTINUE`. */
    action?: string;
    /** OpenMRS's own fulfiller workflow status — e.g. `RECEIVED`, `COMPLETED`, `EXCEPTION`. */
    fulfillerStatus?: string;
    results: Array<{
      test: string;
      panel?: string;
      value: string;
      units?: string;
      datetime?: string;
      range?: string;
      interpretation?: CaseSummaryWireInterpretation;
    }>;
  }>;
  labResultsUnavailable?: true;
  inpatientDetails?: {
    admissionDate?: string;
    ward?: string;
    doctor?: string;
    status?: string;
    dischargeDate?: string;
  };
  /**
   * A SOAP note assembled from everything else in this response — narrative
   * text, not a new source of clinical data. Deterministic and template-based
   * (see `utils/soap-note.helper.ts`), not model-generated: there is no LLM
   * in this service, and a claims/print artifact should not depend on one.
   * Each section is omitted when nothing categorised into it.
   */
  soapNote: {
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
  };
};

/* ------------------------------------------------------------------ *
 * Intermediate shapes — what the mapping helpers produce, before the final
 * `undefined`-scrubbing pass into the wire shape above.
 * ------------------------------------------------------------------ */

export type CaseSummarySoapNote = CaseSummaryResponse['soapNote'];
export type CaseSummaryDemographics = CaseSummaryResponse['demographics'];
export type CaseSummaryAllergy = CaseSummaryResponse['allergies'][number];
export type CaseSummaryMedication = CaseSummaryResponse['medications'][number];
export type CaseSummaryVitals = CaseSummaryResponse['vitals'];
export type CaseSummaryEncounterNote =
  CaseSummaryResponse['clinicalNotes'][number];
export type CaseSummaryInpatientDetails = NonNullable<
  CaseSummaryResponse['inpatientDetails']
>;

/** One "LABEL: value" field, structurally joined — no more `parseObsDisplay` string splitting. */
export type CaseSummaryObs = { label: string; value: string };

/** A visit encounter, lightly mapped for ADT classification and obs-derived vitals/notes. */
export type CaseSummaryEncounter = {
  uuid: string;
  encounterDatetime?: string;
  encounterTypeUuid?: string;
  encounterType?: string;
  location?: string;
  provider?: string;
  obs: Array<CaseSummaryObs>;
};

/** Active diagnosis, before the `primary: boolean` -> `primary?: true` wire trim. */
export type CaseSummaryDiagnosis = {
  code?: string;
  description: string;
  certainty?: string;
  primary: boolean;
  onsetDate?: string;
};

/** A test/panel ordered during the visit, before the `pending: boolean` -> `pending?: true` wire trim. */
export type CaseSummaryTestOrder = {
  uuid: string;
  orderNumber?: string;
  /** Internal AMRS concept_id, used only to join the obstree walk — never sent on the wire. */
  conceptId: number;
  test: string;
  orderedDate?: string;
  action?: string;
  fulfillerStatus?: string;
  results: Array<CaseSummaryLabResult>;
  pending: boolean;
};

/** One resulted analyte, flattened out of one concept-tree branch. `interpretation` is always populated here (including `NORMAL`/`'--'`); the wire trim happens at response-assembly time. */
export type CaseSummaryLabResult = {
  test: string;
  panel?: string;
  value: string;
  units?: string;
  datetime?: string;
  range?: string;
  interpretation: CaseSummaryLabInterpretation;
};

export type CaseSummaryVisit = {
  uuid: string;
  display?: string;
  visitType?: string;
  startDatetime?: string;
  stopDatetime?: string;
};

/* ------------------------------------------------------------------ *
 * Concept-tree walk — replaces the REST `obstree` resource. Built in-process
 * from `ConceptSetMemberRow` + `LabObsRow` (see `buildConceptTree` in
 * case-summary.service.ts), then walked by `flattenObsTree`.
 * ------------------------------------------------------------------ */

export type ObsTreeRange = {
  lowAbsolute?: number | null;
  lowCritical?: number | null;
  lowNormal?: number | null;
  hiNormal?: number | null;
  hiCritical?: number | null;
  hiAbsolute?: number | null;
};

/**
 * One observation inside a concept-tree node.
 *
 * No bound fields here, unlike the frontend's `ObsTreeObs`: those existed
 * because the REST `obstree` resource snapshotted the concept's *current*
 * `concept_numeric` bounds onto every obs node it returned, and rule 6 in the
 * spec (§6) preferred that per-obs copy over the node's. The raw schema has
 * no such per-obs snapshot — `concept_numeric` is the only source of bounds,
 * keyed by concept — so that preference collapses to "always use the node".
 */
export type ObsTreeObs = {
  obsDatetime?: string | null;
  valueNumeric?: number | null;
  valueText?: string | null;
  valueCodedName?: string | null;
};

/** A node of the concept tree. Self-recursive via `subSets`. `obs` is EMPTY when the test was ordered but is not yet resulted. */
export type ObsTreeNode = ObsTreeRange & {
  conceptId?: number;
  display?: string;
  units?: string;
  obs?: Array<ObsTreeObs>;
  subSets?: Array<ObsTreeNode>;
};

/** The span of days a result must fall in to count as belonging to the visit. Absent `stopDatetime` means the visit is still open — no upper bound. */
export type ObsVisitWindow = {
  startDatetime?: string;
  stopDatetime?: string;
};

/* ------------------------------------------------------------------ *
 * Row types — raw shapes of `dataSource.query(sql, params)` results.
 * ------------------------------------------------------------------ */

/** Q1 — one candidate visit, joined to the patient's demographics. */
export type VisitRow = {
  uuid: string;
  dateStarted: string;
  dateStopped: string | null;
  visitType: string;
  locationName: string | null;
  patientUuid: string;
  givenName: string | null;
  middleName: string | null;
  familyName: string | null;
  gender: string | null;
  birthdate: string | null;
};

/** Q1 — one patient identifier, matched against a type uuid with a name fallback (see `matchIdentifier`). */
export type IdentifierRow = {
  identifier: string;
  identifierTypeUuid: string | null;
  identifierTypeName: string | null;
  preferred: number;
};

/** Q2 — one non-voided encounter belonging to the merged visits. */
export type EncounterRow = {
  encounterId: number;
  uuid: string;
  encounterDatetime: string | null;
  encounterTypeUuid: string;
  encounterTypeName: string;
  locationName: string | null;
  providerDisplay: string | null;
};

/** Q2 — one non-voided obs recorded on one of those encounters (vitals + clinical notes; NOT lab results — see `LabObsRow`). */
export type EncounterObsRow = {
  encounterId: number;
  conceptName: string;
  valueNumeric: number | null;
  valueText: string | null;
  valueDatetime: string | null;
  valueCodedName: string | null;
};

/** Q2 — one non-voided order (drug or test, discriminated by `javaClassName`) on the merged visits. */
export type OrderRow = {
  uuid: string;
  orderNumber: string | null;
  action: string | null;
  dateActivated: string | null;
  dateStopped: string | null;
  autoExpireDate: string | null;
  conceptId: number;
  conceptUuid: string;
  conceptName: string;
  orderTypeUuid: string | null;
  orderTypeName: string | null;
  javaClassName: string | null;
  /** OpenMRS's own fulfiller workflow status (e.g. `RECEIVED`, `COMPLETED`, `EXCEPTION`) — not currently used to decide pending/resulted, just surfaced. */
  fulfillerStatus: string | null;
  encounterUuid: string;
  dose: number | null;
  doseUnitsName: string | null;
  routeName: string | null;
  frequencyName: string | null;
  duration: number | null;
  durationUnitsName: string | null;
  instructions: string | null;
  drugName: string | null;
  drugStrength: string | null;
};

/** Q2 — one encounter diagnosis, with its ICD-11 mapping already joined. */
export type DiagnosisRow = {
  conceptName: string;
  certainty: string | null;
  dxRank: number | null;
  onsetDate: string | null;
  icd11Code: string | null;
};

/** Q2 — one patient-level allergy + its (possibly several) reactions, pre-joined and comma-combined. */
export type AllergyRow = {
  substance: string;
  severity: string | null;
  reactions: string | null;
};

/** Q3 — one concept in the ordered tests' concept-set hierarchy, walked to `depth < 6` (see `OBS_TREE_MAX_DEPTH`). */
export type ConceptSetMemberRow = {
  conceptId: number;
  parentConceptId: number | null;
  depth: number;
  display: string;
  units: string | null;
  lowAbsolute: number | null;
  lowCritical: number | null;
  lowNormal: number | null;
  hiNormal: number | null;
  hiCritical: number | null;
  hiAbsolute: number | null;
};

/** Q3 — one non-voided obs against a member concept, in the visit window. */
export type LabObsRow = {
  conceptId: number;
  obsDatetime: string | null;
  valueNumeric: number | null;
  valueText: string | null;
  valueCodedName: string | null;
};
