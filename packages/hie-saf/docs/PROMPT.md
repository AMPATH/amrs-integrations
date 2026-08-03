  Implement the `GET /case-summary` endpoint in `packages/hie-saf`.

  The specification is at `packages/hie-saf/docs/case-summary-endpoint.md`. Read it in
  full before writing anything — it is an approved proposal, so follow it rather than
  redesigning. §4 lists the exact files and the build order.

  Answers to the §9 open questions (these override the spec wherever they differ):
 
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


  Reference implementation: a working client-side version of this exact logic lives in
  the other repo at /media/ampath-esm-dha-workflow-app/src/case-summary/.
  - `case-summary.resource.ts` holds the pure functions named in §6: assessValue,
    formatReferenceRange, flattenObsTree, readObsValue, isDrugOrderActive,
    isTestOrderType, orderBelongsToVisit, pickAnchorVisit, sameDayVisits,
    mergeVisitPayloads, buildVitalsFromEncounters, buildEncounterNotes,
    buildInpatientDetails, mapConditionEntry.
    PORT THESE VERBATIM — do not re-derive them. Each encodes a rule that the obvious
    implementation got wrong against real AMRS data, and §6 explains why for each.
  - `case-summary.resource.test.ts` has 110 passing tests. Port the pure-function test
    tables; per §7 they are the acceptance criteria for this endpoint.

  Conventions: `src/shr/` is the template module — copy its docblock style, its
  `readResponse`/`asHttpException` error handling, and its `Test.createTestingModule`
  spec style with `jest.fn()` doubles.
