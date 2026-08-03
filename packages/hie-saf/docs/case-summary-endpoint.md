# Spec: `GET /case-summary` — Visit Case Summary

**Status:** proposal
**Package:** `packages/hie-saf`
**Template module:** `src/shr/` (newest module in the package; its docblock/error/test idioms are the de-facto convention)

---

## 1. Why

The O3 frontend (`@ampath/esm-dha-workflow-app`, `src/case-summary/`) renders a printable
**Patient Clinical Summary** — demographics, allergies, active diagnoses with ICD-11 codes,
vitals, active medications, test results with reference ranges, clinical notes, inpatient
details. It currently assembles that entirely client-side.

Measured cost of the client-side version:

| | |
|---|---|
| Module size | **3,403 lines** (1,220 resource + 341 types + 1,493 tests + 349 view) |
| HTTP requests per summary | **~11** — visit + allergies + Condition + 2× drug-order (one per care setting) + obstree (+N per-concept retries) + N× `/concept` for ICD-11 |
| Workarounds for data-model quirks | 4 custom-representation rejections, 5 unusable FHIR resources, 3 patient-vs-visit scoping traps |

Three reasons to move it here:

1. **Divergence risk on a claims artifact.** The summary derives ICD-11 codes, abnormal
   flags and result interpretations in the browser, while the claims path derives ICD-11
   independently via ETL `/patient/diagnosis`. Two implementations, one document that goes
   to SHA. The frontend already has an empty `attachments/case-summary/case-summary.tsx`
   stub with a dangling `caseSummaryRef`, i.e. this was always intended as a claim
   attachment.
2. **Every fragile thing is a symptom of joining client-side.** The order→concept→obstree
   pairing heuristics (uuid → display → positional), the per-concept obstree retry, the
   wide/narrow representation fallback, `javaClassName` sniffing, dual care-setting
   fetches — all exist only because the client cannot join. A SQL join removes them.
3. **Print correctness.** `react-to-print` needs the whole document in the DOM. Eleven
   requests behind one loading flag means one slow call yields a half-printed record.

---

## 2. Key decision: read AMRS by SQL, not by proxying OpenMRS REST

Two ways to implement this endpoint. **Recommended: (B).**

**(A) Proxy — the service makes the same OpenMRS REST calls server-side.**
Cheap to write, and `src/shr/utils/practitioner-resolver.helper.ts` already shows the
native-`fetch`-to-OpenMRS idiom. But it is honestly a thin wrapper: it still uses custom
representations, so **every representation-rejection failure mode survives the move**, and
it still fans out to ~10 upstream calls. It buys only the single-client-request and
single-loading-state benefits.

**(B) Direct read-only SQL against the AMRS OpenMRS schema.** ✅
Collapses ~11 HTTP calls into ~3 queries, removes representation reflection entirely, and
lets `obs`/`orders`/`concept_reference_map` be joined in one pass instead of paired by
display-name heuristics. This is what actually delivers the reasons in §1.

**Not ETL** — see §5.1 for the performance reasoning and why the existing
`etl.flat_*` tables are not a fit here.

> **Precedent:** direct `amrs.*` reads are already established in this monorepo, just not
> in `hie-saf`. `packages/eid/app/helpers/dbConnect.ts` queries `amrs`/`etl` through
> `packages/core`'s connection manager (`CM.query(sql, amrsCON)`), and
> `packages/rde-sync/app/services/hiv-summary.service.ts:10` reads
> `amrs.patient_identifier` directly. So this is a new capability for *this package*, not
> for the platform.

> ⚠️ **New capability for this package.** `hie-saf` today owns exactly one TypeORM
> connection (`legacyConnection`, `src/core/database/db.module.ts:13-39`) pointing at the
> **`hie` MariaDB**, and nothing in `src/` reads OpenMRS `obs`, `orders`, or `encounter`
> (grep for `obstree`/`concept`/`lab`: zero hits). This endpoint introduces a **second,
> read-only connection to the AMRS OpenMRS database**. That is the main review question
> before implementation.

---

## 3. Contract

```
GET /case-summary?patientUuid=<uuid>&locationUuid=<uuid>[&visitUuid=<uuid>]
```

`@UseGuards(OpenMrsAuthGuard)` — authentication is a valid OpenMRS `JSESSIONID` cookie, as
on every other feature controller. No global prefix exists (`main.ts` has no
`setGlobalPrefix`), so the path is exactly `/case-summary`.

**Response: the summary object, bare.** No envelope — consistent with the package, which
returns upstream JSON, entity arrays, or ad-hoc objects unwrapped.

Every field is either rendered on the page or drives a rendering decision. Nesting appears
only where it is semantic (a panel's analytes belong under their order). Optional fields are
**omitted when absent, never sent as `null`** — with this many optionals that is the single
biggest size lever, and `JSON.stringify` drops `undefined` keys for free.

```ts
type CaseSummaryResponse = {
  /** Anchor visit; the merged span when several same-day visits were folded in. */
  visit: {
    uuid: string;
    display?: string;
    visitType?: string;
    startDatetime?: string;   // earliest start across merged visits
    stopDatetime?: string;    // latest stop; ABSENT while any merged visit is open
  };
  /** All folded-in visit uuids, anchor first. Length > 1 ⇒ the view says "N visits combined". */
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

  /** Active diagnoses. `code` is ICD-11, joined from concept_reference_map. */
  conditions: Array<{
    code?: string;
    description: string;
    certainty?: string;       // 'confirmed' | 'provisional'
    primary?: true;           // present only for a rank-1 diagnosis
    onsetDate?: string;
  }>;

  /** Keyed, not an array of {label,value} pairs — display labels belong in the view. */
  vitals: {
    temperature?: string;
    bloodPressure?: string;   // pre-combined "120/80 mmHg"
    pulse?: string;
    respiratoryRate?: string;
    spo2?: string;
    height?: string;
    weight?: string;
    bmi?: string;
    tewScore?: string;
  };

  /** Active drug orders only — inactive ones are filtered server-side. */
  medications: Array<{
    date?: string;
    drug: string;             // name with strength
    dose?: string;            // value + units, e.g. "500 mg"
    route?: string;
    frequency?: string;
    duration?: string;        // value + units, e.g. "5 Days"
    instructions?: string;
  }>;

  /** One entry per encounter that recorded non-vital obs, newest first. */
  clinicalNotes: Array<{
    encounterUuid: string;
    encounterType?: string;   // e.g. "GENCONSULTATION"
    datetime?: string;
    fields: Array<{ label: string; value: string }>;
  }>;

  labOrders: Array<{
    uuid: string;
    test: string;             // ordered test or panel name
    orderNumber?: string;
    orderedDate?: string;
    pending?: true;           // present only when no in-window result was found
    results: Array<{
      test: string;           // analyte name
      panel?: string;         // immediate parent when nested; absent at root
      value: string;
      units?: string;
      datetime?: string;
      range?: string;         // pre-formatted normal range, e.g. "13 – 17"
      /** Absent ⇒ normal or unassessable. Present ⇒ render the flag. */
      interpretation?: 'LOW' | 'HIGH' | 'CRITICALLY_LOW' | 'CRITICALLY_HIGH'
                     | 'OFF_SCALE_LOW' | 'OFF_SCALE_HIGH';
    }>;
  }>;
  /** Present only when orders existed but the lab query failed. */
  labResultsUnavailable?: true;

  /** Present only for a visit with an ADT encounter — omitted entirely for outpatient. */
  inpatientDetails?: {
    admissionDate?: string;
    ward?: string;
    doctor?: string;
    status?: string;
    dischargeDate?: string;
  };
};
```

### 3.1 What was deliberately dropped, and why

The frontend's `VisitCaseSummary` carries several fields that exist only because the client
had to assemble the document from many sources. Once the join happens server-side they are
dead weight:

| Dropped | Why it existed | Why it goes |
|---|---|---|
| `groups.allergies[].resource.*` | raw FHIR `AllergyIntolerance` bundle entries | two levels of nesting (`groups.allergies[0].resource.code.coding[0].display`) to reach three strings. Now a flat `allergies[]`, mapped server-side. |
| `groups.encounters[]` | synthetic `{resource:{resourceType:'Encounter', id}}` array | duplicated `encounterUuids` exactly. Both go: nothing renders encounter uuids. |
| `encounterUuids` | client needed them to scope FHIR fetches | scoping is now a SQL predicate. Nothing on the page shows them. |
| `patientUuid` | echoed request param | the caller supplied it. |
| `conditions[].conceptUuid` | input to the `/concept/{uuid}` ICD-11 lookup | the lookup is now a join; the client never sees a concept uuid. |
| `medications[].visitUuid` | orders were fetched patient-wide and needed attribution | everything returned is already visit-scoped. |
| `medications[].active` | client filtered `active === true` before rendering | filter server-side and only send what renders. |
| `labOrders[].orderTypeDisplay` | diagnostics while order-type matching was loose | `java_class_name` is exact; no diagnostics needed. |
| `labOrders[].conceptUuid` | needed to build the obstree request | request is server-side. |
| `results[].conceptUuid` | React key | `test` or index serves. |
| `results[].abnormal` | so the view stayed dumb | fully derivable from `interpretation`; one boolean per analyte row adds up across a 26-row CBC. |
| `clinicalNotes[].display` | old note heading | embeds the date, so it printed the date twice beside the timestamp. `encounterType` replaced it. |
| `vitals[]` as `{label,value}` pairs | mirrored a generic key/value grid | nine objects repeating a `"label"` key, with labels fixed and known. A keyed object is smaller and directly addressable; display text belongs in the view. |

Two encodings also changed to shrink the common case:

- **`primary`, `pending`, `labResultsUnavailable` are `true`-or-absent**, not `boolean`.
  These are false for most rows, and absent costs nothing.
- **`interpretation` is omitted for normal and unassessable results.** `NORMAL` and `'--'`
  both mean "render no flag", so the field only appears when there is something to say.
  This removes a string from most analyte rows. Note the frontend's `'--'` sentinel
  disappears from the wire entirely, which also retires the `'--'`-versus-`'—'` footgun.

Nesting that is kept, because it is meaningful: `labOrders[].results[]` (a panel expands to
many analytes under one order) and `clinicalNotes[].fields[]` (obs belong to an encounter,
order matters, and labels can legitimately repeat).

**Errors** follow `src/shr/shr.service.ts:244-282` — the newest and cleanest idiom in the
package (`readResponse` / `asHttpException`): rethrow an `HttpException` untouched, log
with the static `Logger`, otherwise wrap as 500. Specifically:

| Condition | Response |
|---|---|
| missing/blank `patientUuid` or `locationUuid` | `400` `BadRequestException` from the controller |
| patient has no visits | `404` `NotFoundException('No visit found for this patient.')` |
| `visitUuid` given but not found | `404` |
| AMRS DB unreachable | `502` `HttpException(..., HttpStatus.BAD_GATEWAY)` |
| lab result query fails but the rest succeeds | `200` with `labResultsUnavailable: true` |

That last row matters: a lab failure must **degrade**, never fail the request — the
existing `claim-diagnosis.service.ts:22-68` pattern of isolating a non-essential step in
its own try/catch is the precedent.


### 3.2 Worked example

A real outpatient day for the screenshot patient — three merged visits, one resulted panel,
one pending test. Note what is *absent*: no `null`s, no `interpretation` on the normal row,
no `primary`/`pending` where false, no `inpatientDetails` at all.

```json
{
  "visit": {
    "uuid": "3d89c792-a0f1-4f83-ae99-429cbc65ad68",
    "display": "OPD Visit @ Location Test",
    "visitType": "OPD Visit",
    "startDatetime": "2026-08-03T07:00:00.000+0300"
  },
  "visitUuids": ["3d89c792-a0f1-4f83-ae99-429cbc65ad68", "a1b2c3d4-...", "e5f6a7b8-..."],
  "demographics": {
    "name": "shariff Kipkemoi",
    "birthDate": "1997-11-29",
    "gender": "M",
    "age": "28",
    "patientId": "814299403-0",
    "nationalId": "37209295",
    "crNumber": "CR1900367291321-5"
  },
  "allergies": [{ "substance": "HEPARIN", "reaction": "ANEMIA" }],
  "conditions": [
    { "code": "BA04", "description": "Secondary hypertension", "certainty": "confirmed", "primary": true },
    { "code": "PA83.1", "description": "Unintentionally cut or pierced by sharp glass", "certainty": "confirmed" }
  ],
  "vitals": {
    "temperature": "40.0",
    "bloodPressure": "120/89 mmHg",
    "pulse": "72",
    "respiratoryRate": "13",
    "spo2": "100",
    "height": "170.0",
    "weight": "75.0",
    "bmi": "26.0",
    "tewScore": "0"
  },
  "medications": [
    { "date": "2026-08-03T09:12:00.000+0300", "drug": "OMEPRAZOLE 20mg TAB", "duration": "30 DAYS" }
  ],
  "clinicalNotes": [
    {
      "encounterUuid": "8571c2e1-c2fb-43a6-b1ab-aaa7c5fc40f2",
      "encounterType": "GENCONSULTATION",
      "datetime": "2026-08-03T18:10:00.000+0300",
      "fields": [
        { "label": "CHIEF COMPLAINT, DETAILED", "value": "MODERATE, 2, ABDOMINAL PAIN" },
        { "label": "GENERAL EXAM FINDINGS", "value": "WASTING" },
        { "label": "REVIEW OF SYSTEMS", "value": "NORMAL" }
      ]
    }
  ],
  "labOrders": [
    {
      "uuid": "ord-cbc-1",
      "test": "COMPLETE BLOOD COUNT",
      "orderNumber": "ORD-10231",
      "orderedDate": "2026-08-03T11:00:00.000+0300",
      "results": [
        {
          "test": "HEMATOCRIT",
          "panel": "COMPLETE BLOOD COUNT",
          "value": "200.0",
          "units": "%",
          "datetime": "2026-08-03T12:33:46.000+0300",
          "range": "36.1 – 50.3",
          "interpretation": "HIGH"
        },
        {
          "test": "HEMOGLOBIN",
          "panel": "COMPLETE BLOOD COUNT",
          "value": "14.0",
          "units": "g/dL",
          "datetime": "2026-08-03T12:33:46.000+0300",
          "range": "11 – 18"
        }
      ]
    },
    {
      "uuid": "ord-rbs-1",
      "test": "RANDOM BLOOD SUGAR",
      "orderedDate": "2026-08-03T11:05:00.000+0300",
      "pending": true,
      "results": []
    }
  ]
}
```

---

## 4. Files to add

Mirrors the per-feature shape used everywhere in `src/` (`src/shr/` is canonical).

```
src/case-summary/
  case-summary.module.ts
  case-summary.controller.ts
  case-summary.service.ts
  case-summary.service.spec.ts
  dto/fetch-case-summary.dto.ts
  types/index.ts
  utils/lab-result.helper.ts        # assessValue, formatReferenceRange, flattenObsTree
  utils/visit-window.helper.ts      # isoDatePart, sameDayVisits, mergeVisits, window rules
src/core/database/
  db.module.ts                      # MODIFIED — add the amrs read-only connection
docs/case-summary-endpoint.md       # this file
```

Modified elsewhere:

- `src/app.module.ts:24` — add `CaseSummaryModule` to `imports`.
- `src/app.module.ts:28-42` — add the new env vars to the **Joi schema** (it currently
  validates 12 vars; anything omitted is silently `undefined`, as already happens for
  `AMRS_BASE_URL`/`BASIC_AUTH`).
- `README.md:21-40` — document the new vars in the `.env` block.

### 4.1 DTO — `dto/fetch-case-summary.dto.ts`

Follows `src/shr/dto/fetch-patient-records.dto.ts`: `@ApiProperty` then validators,
`@IsOptional()` first on optionals, `!`/`?` definite assignment, and a **mandatory
`locationUuid`** (every DTO in the package carries it).

```ts
/**
 * Assemble a patient's visit case summary.
 * Omit `visitUuid` for the default behaviour: the patient's current visit, merged with
 * any sibling visit started the same calendar day.
 */
export class FetchCaseSummaryDto {
  @ApiProperty({ description: 'OpenMRS patient uuid' })
  @IsNotEmpty()
  @IsString()
  patientUuid!: string;

  @ApiPropertyOptional({ description: 'Summarise this visit only; no same-day merging' })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  visitUuid?: string;

  @ApiProperty({ description: 'Login location uuid; resolves the facility' })
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
```

> Note `ValidationPipe` is constructed bare in `main.ts:16` — no `whitelist`, no
> `transform` — so query values arrive as strings and unknown keys are not stripped. Do
> not rely on coercion.

### 4.2 Types — `types/index.ts`

`type` aliases + `enum`s with a file-level docblock and per-type comments, per
`src/shr/types/index.ts:1-107`. Response types take the `...Response` suffix used in
`claims/`. Row types for raw SQL results should be suffixed `...Row` (new, but no existing
convention covers raw rows since `hwr-sync.service.ts:37-40` is the only raw query).

### 4.3 Controller — `case-summary.controller.ts`

```ts
/**
 * Visit case summary: one assembled clinical document for printing and for
 * attachment to a SHA claim.
 */
@UseGuards(OpenMrsAuthGuard)
@Controller('case-summary')
export class CaseSummaryController {
  constructor(private readonly caseSummaryService: CaseSummaryService) {}

  @Get()
  getCaseSummary(@Query() query: FetchCaseSummaryDto) {
    return this.caseSummaryService.getVisitCaseSummary(query);
  }
}
```

Cross-field guard clauses, if any are added later, throw `BadRequestException` from the
controller — as in `visit.controller.ts:26-32` and `shr.controller.ts:156-162`.

### 4.4 Service — `case-summary.service.ts`

`@Injectable()`, constructor-injected `ConfigService` + the AMRS `DataSource`. Orchestrates
in three queries and delegates all clinical rules to `utils/`:

```ts
async getVisitCaseSummary(dto: FetchCaseSummaryDto): Promise<VisitCaseSummary> {
  const visits = dto.visitUuid
    ? await this.queryVisitByUuid(dto.visitUuid)
    : await this.queryRecentVisits(dto.patientUuid);
  const anchor = pickAnchorVisit(visits);
  if (!anchor) throw new NotFoundException('No visit found for this patient.');

  const merged = dto.visitUuid ? [anchor] : sameDayVisits(visits, anchor);
  const window = visitWindow(merged);          // earliest start .. latest stop, open if any open

  const [bundle, labs] = await Promise.all([
    this.queryVisitBundle(merged),             // encounters + obs + orders + diagnoses + allergies
    this.queryLabResults(dto.patientUuid, window).catch((error) => {
      Logger.error(`case summary lab results: ${(error as Error).message}`);
      return null;                             // degrade, never fail the document
    }),
  ]);
  ...
}
```

### 4.5 Module — `case-summary.module.ts`

```ts
@Module({
  imports: [TypeOrmModule.forFeature([], AMRS_CONNECTION)],
  controllers: [CaseSummaryController],
  providers: [CaseSummaryService, LabResultHelper, VisitWindowHelper],
})
export class CaseSummaryModule {}
```

Per the package's existing (anti-)pattern, any borrowed provider is re-declared in
`providers` rather than exported/imported — see `shr.module.ts:13-27`.

### 4.6 Second DB connection — `src/core/database/db.module.ts`

Add alongside the existing `legacyConnection`. **Read-only credentials.**

```ts
TypeOrmModule.forRootAsync({
  name: 'amrsConnection',
  imports: [ConfigModule],
  useFactory: (configService: ConfigService) => ({
    name: 'amrsConnection',
    type: 'mysql',
    host: configService.get<string>('AMRS_DATABASE_HOST'),
    port: configService.get<number>('AMRS_DATABASE_PORT'),
    username: configService.get<string>('AMRS_DATABASE_USER'),
    password: configService.get<string>('AMRS_DATABASE_PASSWORD'),
    database: configService.get<string>('AMRS_DATABASE_NAME'),
    poolSize: configService.get<number>('AMRS_DATABASE_POOL_SIZE'),
    entities: [],          // raw queries only — do not map OpenMRS tables to entities
    synchronize: false,    // as with legacyConnection: never let TypeORM touch the schema
  }),
  inject: [ConfigService],
});
```

`entities: []` is deliberate: mapping OpenMRS tables would invite writes and schema
coupling. This connection is for `dataSource.query(sql, params)` reads only.

New env vars — add to **both** the Joi schema and the README:
`AMRS_DATABASE_HOST`, `AMRS_DATABASE_PORT`, `AMRS_DATABASE_USER`,
`AMRS_DATABASE_PASSWORD`, `AMRS_DATABASE_NAME`, `AMRS_DATABASE_POOL_SIZE`.

---

## 5. The queries, and what each replaces

All parameters bound positionally with `?`, per `hwr-sync.service.ts:37-40`. **No string
interpolation into SQL anywhere in this package — do not start.**

> **The SQL below is illustrative, not verified.** It is written against the standard
> OpenMRS 2.x schema and has **not been run against the AMRS database** — no
> authenticated DB access was available when this was written. Treat each query as a
> shape to confirm: check column names against the live schema, and confirm the MariaDB
> version supports `WITH RECURSIVE` (10.2+) before relying on Q3's CTE. The *behavioural*
> rules in §6 are the verified part; they came from real payloads.

### Q1 — candidate visits (replaces `GET /visit?...` ×1–2)

```sql
SELECT v.uuid, v.date_started, v.date_stopped, vt.name AS visit_type,
       p.uuid AS patient_uuid, pn.given_name, pn.middle_name, pn.family_name,
       pe.gender, pe.birthdate
  FROM visit v
  JOIN visit_type vt ON vt.visit_type_id = v.visit_type_id
  JOIN person pe     ON pe.person_id = v.patient_id
  JOIN patient p     ON p.patient_id = v.patient_id
  LEFT JOIN person_name pn ON pn.person_id = pe.person_id AND pn.preferred = 1 AND pn.voided = 0
 WHERE p.uuid = ? AND v.voided = 0
 ORDER BY v.date_started DESC
 LIMIT 10;
```

`LIMIT 10` matches the frontend's `VISIT_LOOKBACK_LIMIT` — generous for one day's
check-ins, and anything outside the anchor's day is discarded anyway.

Identifiers (National ID, CR number) come from `patient_identifier` joined to
`patient_identifier_type`. Match by **identifier type uuid with a name fallback**, as
`matchIdentifier` does — the frontend needs that fallback because type uuids differ by
deployment:

- National ID `58a47054-1359-11df-a1f1-0026b9348838`
- Client Registry `e88dc246-3614-4ee3-8141-1f2a83054e72`

### Q2 — the visit bundle (replaces the widened visit rep + both `/order` fetches + FHIR `Condition` + FHIR `AllergyIntolerance`)

One query per collection over `visit_id IN (?)` for the merged visit ids:

- **Encounters + obs** — `encounter` ⨝ `encounter_type` ⨝ `obs` ⨝ `concept_name`,
  `obs.voided = 0`. Yields `{ label, value }` pairs **structurally**, replacing the
  frontend's `parseObsDisplay`, which splits the REST `display` string on `': '`.
  *This is the single biggest win: no more string parsing of clinical values.*
- **Orders** — `orders` ⨝ `order_type` ⨝ `concept`, plus `LEFT JOIN drug_order` for
  dose/route/frequency/duration. Discriminate by
  **`order_type.java_class_name = 'org.openmrs.TestOrder'`** vs `'org.openmrs.DrugOrder'`.
  Confirmed on this server: `Test` = `53eb4768-1359-11df-a1f1-0026b9348838`,
  `Drug` = `53eb466e-1359-11df-a1f1-0026b9348838`, and **six other types are a bare
  `org.openmrs.Order`** (Radiology, Procedure, Medical Supplies, two Consultation types,
  SHA Intervention Switch) — which is exactly why display-name matching is not sufficient
  and `java_class_name` is the correct discriminator. This also removes the dual
  care-setting fetch: `care_setting` becomes a column, not two round-trips.
- **Diagnoses** — `encounter_diagnosis` ⨝ `concept`, with `certainty` and `rank`
  (`rank = 1` ⇒ primary).
- **ICD-11 codes** — `concept_reference_map` ⨝ `concept_reference_term` ⨝
  `concept_reference_source WHERE name LIKE '%ICD%11%'`. **Replaces N `/concept/{uuid}`
  round-trips with a join.** The source on this server is named `ICD-11-WHO`; match
  loosely rather than on the literal, as the frontend's `isIcd11` does.
- **Allergies** — `allergy` ⨝ `allergy_reaction`, shaped into the FHIR-ish
  `{ resource: {...} }` the existing view already consumes.

### Q3 — lab results (replaces `/obstree` and its per-concept retry)

For the ordered test concepts, walk the concept-set hierarchy and pull obs in the visit
window:

```sql
WITH RECURSIVE members AS (
  SELECT cs.concept_id, cs.concept_set AS parent_id, 1 AS depth
    FROM concept_set cs WHERE cs.concept_set IN (?)
  UNION ALL
  SELECT child.concept_id, child.concept_set, m.depth + 1
    FROM concept_set child JOIN members m ON child.concept_set = m.concept_id
   WHERE m.depth < 6
)
SELECT ...
  FROM obs o
  JOIN concept c        ON c.concept_id = o.concept_id
  LEFT JOIN concept_numeric cn ON cn.concept_id = c.concept_id
 WHERE o.person_id = ?              -- the selective predicate; see §5.1
   AND o.voided = 0
   AND o.obs_datetime >= ?          -- half-open range, NOT DATE(o.obs_datetime)
   AND o.obs_datetime <  ?          -- exclusive: day-after-stop, or a far future bound
                                    -- while any merged visit is still open
   AND o.concept_id IN (SELECT concept_id FROM members UNION SELECT ...);
```

> **Do not write `DATE(o.obs_datetime) BETWEEN ? AND ?`.** Wrapping the column in a
> function makes the predicate non-sargable, so no index on `obs_datetime` can be used.
> Here the damage is masked because `person_id = ?` already narrows to a few thousand
> rows — which is precisely why it would pass testing and then bite whoever reuses the
> query without a patient filter. Bound the range half-open instead, and pass the
> boundaries as datetimes derived from the window's calendar days (rule 8 in §6: compare
> days as written, do not convert time zones).

`depth < 6` mirrors the frontend's `OBS_TREE_MAX_DEPTH`; real panels nest 1–2 deep
(observed: `LABORATORY TESTS → RENAL FUNCTION BLOOD TEST → SERUM ELECTROLYTES → SERUM
SODIUM`). Reference ranges come from `concept_numeric`
(`low_absolute`, `low_critical`, `low_normal`, `hi_normal`, `hi_critical`, `hi_absolute`,
`units`).

This removes **three** frontend workarounds at once: the comma-vs-`%2C` concept parameter,
the per-concept retry when a multi-concept request is refused, and the
uuid → display → positional pairing of tree roots to orders (a join on `concept_id` is
exact).

### 5.1 Performance: why a multi-million-row `obs` table is not the problem

The concern is reasonable — `obs` in a production AMRS is tens to hundreds of millions of
rows. It does not apply here, for one structural reason: **every query in this endpoint is
anchored to a single patient or a handful of encounter ids.**

| Query | Selective predicate | Rows reached |
|---|---|---|
| Q1 visits | `patient.uuid = ?` | ≤ 10 |
| Q2 encounters/obs/orders | `encounter_id IN (~5 ids)` | tens–hundreds |
| Q3 lab obs | `obs.person_id = ?` | one patient's lifetime obs, ~10²–10³ |

`obs.person_id` and `obs.encounter_id` are both indexed foreign keys in OpenMRS core. An
indexed lookup for one patient costs single-digit milliseconds whether the table holds 10M
or 500M rows — **table size only matters when the access path degrades to a scan.** The
patterns that would degrade it are absent by construction: no unbounded date ranges without
a patient filter, no cross-patient aggregates, no `LIKE '%…%'` on concept names, no
`ORDER BY` over an unindexed column.

The recursive CTE in Q3 walks `concept_set`, which is **concept metadata** (thousands of
rows, effectively static) — not `obs`. It is cheap and a good candidate for an in-process
cache keyed by root concept, in the same spirit as the frontend's `icd11CodeCache`.

**The load already exists, and this reduces it.** Every `/visit?v=custom:(…)`, `/order`,
`/obstree` and `/concept` call the frontend makes today already runs Hibernate queries
against `obs`/`orders`/`concept` on this same database, and `obstree` already walks the
concept tree and pulls obs server-side. Replacing ~11 REST round-trips — each with full
object hydration and lazy-load chatter — with 3 targeted queries **lowers** total DB work
per summary. The performance objection applies more forcefully to the status quo.

**Guardrails, in priority order:**

1. **Point the connection at a read replica**, not the primary. This is a read-only,
   reporting-shaped query against a live clinical system.
2. **Set a statement timeout** on that connection so a pathological query can never affect
   clinical operations.
3. **`EXPLAIN` each query against real data before adding any index.** If Q3 needs help the
   composite is `(person_id, concept_id, obs_datetime)` — but do not add an index to a
   production EMR speculatively; confirm the plan first, since the existing `person_id`
   index may already suffice.
4. **Keep the pool small** (`AMRS_DATABASE_POOL_SIZE` 2–4). This endpoint is interactive and
   low-volume, not a batch job, and it must not be able to starve the EMR of connections.

**Why not the existing ETL flat tables.** AMRS ETL is queue-driven and incremental rather
than a nightly batch — `packages/rde-sync/app/services/hiv-summary.service.ts:10` populates
`etl.flat_hiv_summary_sync_queue` from `amrs.patient_identifier` — so freshness is *not*
the disqualifier I first assumed. The fit is. `etl.flat_labs_and_imaging` already exists and
is queried by `packages/eid/app/helpers/dbConnect.ts:26-41`, but the columns visible there
(`hiv_viral_load`, `cd4_count`, `hiv_dna_pcr`) indicate an HIV-program shape, not the
general chemistry and haematology a clinical summary needs — HEMATOCRIT, SERUM CREATININE,
the CBC panel. Reference ranges also live in `concept_numeric` regardless. **Worth a schema
check before dismissing**, but a general summary needs general coverage, and building a new
flat table is strictly more work than one indexed query.

---

## 6. Clinical rules to port verbatim

These were derived against live AMRS data and each one exists because the obvious
implementation was wrong. **Port them; do not re-derive.** File references are to the
frontend `src/case-summary/case-summary.resource.ts`.

1. **Reference-bound presence is `!= null` + finite, never truthiness.** `low_normal = 0`
   is pervasive and legitimate (EOSINOPHILS, BASOPHILS, SERUM CREATININE, RANDOM BLOOD
   SUGAR). A truthy check silently drops it. → `referenceBound`
2. **No bounds at all ⇒ `'--'`, never `NORMAL`.** Real concepts have none
   (`GRANULOCYTE PERCENT`, `UREA MEASUREMENT (CALCULATED)`). Printing "Normal" for an
   unbounded analyte is an unsafe clinical claim. → `assessValue`
3. **Tier order:** absolute → critical → normal, high side before low.
   `hi_absolute` ⇒ `OFF_SCALE_HIGH`, `hi_critical` ⇒ `CRITICALLY_HIGH`,
   `hi_normal` ⇒ `HIGH`, mirrored low. → `assessValue`
4. **Inverted range (`low_normal > hi_normal`) ⇒ `NORMAL`, unflagged.** A mis-configured
   concept must not paint every row abnormal. → `assessValue`
5. **Ignore any server-computed `interpretation`.** On this server it is present on an
   in-range HEMOGLOBIN and *absent* on an out-of-range HEMATOCRIT (200 vs `hi_normal`
   50.3), so trusting it under-reports abnormals. Always compute from bounds.
6. **Prefer the obs's own bounds over the concept's current ones** — each obs carries the
   range in force when the result was taken.
7. **Visit window is day-granular: start day → stop day, and OPEN while any merged visit
   is unclosed.** An ongoing admission keeps accruing results and a lab posts hours or
   days after the sample. A start-day-only filter showed a real result as "Pending".
   → `isObsInVisitWindow`
8. **Compare calendar dates as written, not via `Date`.** All timestamps are `+0300` from
   one server; parsing to `Date` shifts the day for late-evening results. In SQL, compare
   `DATE(o.obs_datetime)` — do not convert time zones. → `isoDatePart`
9. **De-duplicate analytes by concept, latest-on-the-day wins.** The same concept appears
   in several branches of a real tree — HEMOGLOBIN sits under COMPLETE BLOOD COUNT, at the
   root, and under ANTENATAL CARE PROFILE. → `flattenObsTree`
10. **Empty `obs` ⇒ `pending: true`, not omitted.** "Ordered but unresulted" and "never
    ordered" are different clinical statements and the view renders them differently.
11. **Never use the tree root as a panel label.** The root is the query container
    (`LABORATORY TESTS`); it would prefix every row. Panel = *immediate* parent.
12. **A drug order is inactive once stopped, discontinued, or past `auto_expire_date`.**
    The expiry check was initially missing, so finished courses showed as active.
    → `isDrugOrderActive`
13. **Diagnoses and allergies are patient-level, NOT visit-scoped.** Scoping them to the
    visit's encounters emptied both sections — a patient's standing problem list predates
    the visit. Only lab results and notes are visit-scoped.
14. **Merge visits by start day; anchor on the most recent still-open visit** (else the
    most recent). Preferring open stops an ongoing inpatient stay being shadowed by an OPD
    visit that merely started later. → `pickAnchorVisit`, `sameDayVisits`, `mergeVisitPayloads`

---

## 7. Tests

Co-located `case-summary.service.spec.ts`, following
`src/shr/shr.service.spec.ts` — `Test.createTestingModule` with every collaborator as a
`jest.fn()` double, run by `yarn test` (`package.json:65-81`, `rootDir: src`,
`testRegex: .*\.spec\.ts$`).

Substitute the SHR `upstreamResponse` helper with a `queryResult` helper double for
`DataSource.query`, and assert **the exact SQL parameters** the way the SHR spec asserts
exact URLs and headers.

**The frontend's 110 passing tests are the acceptance criteria.** The pure functions
(`assessValue`, `formatReferenceRange`, `flattenObsTree`, `isDrugOrderActive`,
`isTestOrderType`, `orderBelongsToVisit`, `pickAnchorVisit`, `sameDayVisits`,
`mergeVisitPayloads`, `buildVitalsFromEncounters`, `buildEncounterNotes`,
`buildInpatientDetails`, `mapConditionEntry`) port with their test tables intact. Highest
value cases to carry over:

- `low_normal: 0` honoured, not dropped
- no bounds ⇒ `'--'` not `NORMAL`
- inverted range ⇒ `NORMAL`
- obs from a different day excluded, both before *and* after
- open visit ⇒ no upper bound
- multi-day admission covers day 1, a middle day, and the discharge day
- a concept repeated across three branches yields one row
- a node with both `obs` and children emits both
- the real 8-row `/ordertype` table classified correctly (only `Test` is a test order)
- `assessValue` against the real HEMATOCRIT payload (200, `hi_normal` 50.3 ⇒ `HIGH`)

---

## 8. Frontend migration

`src/case-summary/case-summary.resource.ts` reduces to one `hieBaseUrl` fetch beside the
other HIE calls in that app (`src/registry/hie.resource.ts` shows the idiom):

```ts
export async function getVisitCaseSummary(patientUuid: string, visitUuid?: string): Promise<VisitCaseSummary> {
  const hieBaseUrl = await getHieBaseUrl();
  const params = new URLSearchParams({ patientUuid, locationUuid, ...(visitUuid ? { visitUuid } : {}) });
  const response = await openmrsFetch(`${hieBaseUrl}/case-summary?${params.toString()}`);
  return response.json();
}
```

**This is not a pure drop-in, and that is a deliberate trade.** An earlier draft of this
spec mirrored the frontend type exactly so the view needed no edits; §3.1 gives that up in
exchange for a leaner payload. The resulting frontend diff is small and mechanical:

| Frontend change | Edit |
|---|---|
| `types/case-summary.types.ts` | replace `VisitCaseSummary` with `CaseSummaryResponse`; delete the obstree wire types, `ObsVisitWindow`, `CaseSummaryGroupKey`, `FhirEntry`, `FhirBundle` |
| Allergies section | render `allergies[]` directly; delete `mapAllergyRow` **and** `codeableConceptText` (its only remaining caller) |
| Vitals section | iterate a view-local `const VITAL_ROWS: Array<[keyof Vitals, string]>` instead of the server's `label` strings — display text moves to the view, where it belongs and can be translated |
| Test results | `const abnormal = !!row.interpretation` in place of the `abnormal` field; `interpretationLabel`/`interpretationTagType` switch on the narrower union and lose their `NORMAL`/`'--'` arms |
| Medications | drop the `.filter((m) => m.active)` — the server sends only active orders |
| Clinical notes | `note.fields` instead of `note.obs` |
| `case-summary.resource.ts` | reduces to the fetch above; ~1,200 lines deleted |
| `case-summary.resource.test.ts` | ~1,500 lines deleted, after porting the pure-function tables to §7 |

`case-summary.extension.tsx`, the print wiring, and the scss are untouched. Net: the
frontend loses ~2,700 lines and gains about 30 lines of view-level mapping.

Sequence: ship the endpoint → point the frontend at it behind the existing
`hieBaseUrl` config → delete the client-side aggregation. Keep the frontend
implementation on a branch until the endpoint has been verified against the same patients.

---

## 9. Open questions for review

1. **Is a second read-only DB connection to AMRS acceptable in this package?** New for
   `hie-saf`, which has only talked to the `hie` DB and the DHA APIs — but not new for the
   monorepo (`eid` and `rde-sync` both read `amrs.*`). If rejected, fall back to option (A)
   in §2 and accept that the representation fragility stays. We have a read only db used  for read-only
2. **Which DB user, and which host?** Needs `SELECT` only on `visit`, `encounter`, `obs`,
   `orders`, `drug_order`, `encounter_diagnosis`, `allergy`, `concept*`, `person*`,
   `patient_identifier*`. No DDL, no writes. **Prefer a read replica** — see §5.1. I will supply this
3. **Does `etl.flat_labs_and_imaging` cover general chemistry/haematology?** If it turns out
   to carry the full analyte set with reference ranges, Q3 could read it instead of walking
   `concept_set` + `obs`. The visible columns suggest an HIV-program scope, so this is a
   schema question rather than a decision. this is for mostly HIV
4. **`APP_ENV=development` bypasses `OpenMrsAuthGuard` entirely**
   (`openmrs-auth.guard.ts:18-20`). This endpoint returns a full clinical record, so
   confirm that bypass is acceptable for local development only and never set in a
   deployed environment.
5. **Should the response be persisted?** If the summary becomes a claim attachment, an
   audit row (`case_summary` table in the `hie` DB, upstream payload as `json`, following
   `claim-diagnosis.entity.ts`) would give a record of exactly what was submitted. Note
   `synchronize: false` — the table must be created by hand, as there are no migrations in
   this repo. NO
6. **Multi-day inpatient stays** currently merge only visits sharing a *start* day. An OPD
   visit occurring inside an ongoing admission is not merged into it. Intended? YES because we cannot have a running outpatient and inpatient
7. **`RANDOM BLOOD SUGAR` unresolved case.** On the current data, obstree returns no `obs`
   for the RBS concept while the value `5.08` exists as an obs on an ORDER encounter, and
   `5.0` sits on `BLOOD GLUCOSE, FASTING`. A SQL implementation would surface the ORDER
   encounter obs directly — worth confirming which concept the form is meant to write to
   before treating that as fixed. This was fixed ,i was checking wrong thing
