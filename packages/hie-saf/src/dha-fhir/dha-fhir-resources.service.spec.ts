import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { CaseSummaryService } from '../case-summary/case-summary.service';
import { AMRS_CONNECTION } from '../core/database/db.module';
import { EmtService } from '../emt/emt.service';
import { DhaFhirResourcesService } from './dha-fhir-resources.service';

type AnyResource = Record<string, any>;

describe('DhaFhirResourcesService enrichment depth', () => {
  let service: DhaFhirResourcesService;
  const configService = { get: jest.fn() };
  const amrsDataSource = { query: jest.fn() };
  const caseSummaryService = { getVisitCaseSummary: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    amrsDataSource.query.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DhaFhirResourcesService,
        { provide: ConfigService, useValue: configService },
        { provide: CaseSummaryService, useValue: caseSummaryService },
        { provide: EmtService, useValue: {} },
        { provide: getDataSourceToken(AMRS_CONNECTION), useValue: amrsDataSource },
      ],
    }).compile();

    service = module.get<DhaFhirResourcesService>(DhaFhirResourcesService);
  });

  describe('auditEventsForPatient (R4 AuditEvent shape)', () => {
    it('flattens type/subtype to bare Codings and keeps the required requestor', async () => {
      amrsDataSource.query
        .mockResolvedValueOnce([
          {
            resourceUuid: 'enc-1',
            date_created: '2026-08-04 05:18:36',
            creator: 'lab',
            date_changed: null,
            changer: null,
            voided: 0,
            date_voided: null,
            voider: null,
          },
        ])
        .mockResolvedValueOnce([]);

      const events = (await service.auditEventsForPatient('pt-1')) as AnyResource[];
      expect(events).toHaveLength(1);
      const event = events[0];
      expect(event.type).toMatchObject({
        system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
        code: 'rest',
      });
      expect(event.type.coding).toBeUndefined();
      expect(event.subtype[0]).toMatchObject({
        system: 'http://hl7.org/fhir/restful-interaction',
        code: 'create',
      });
      expect(event.subtype[0].coding).toBeUndefined();
      expect(event.agent[0].requestor).toBe(true);
      expect(event.recorded).toBe('2026-08-04T05:18:36+03:00');
    });
  });

  describe('provenancesForPatient (kenya-core-provenance shape)', () => {
    it('drops the R4-removed requestor, uses v3-DataOperation and types the agent', async () => {
      amrsDataSource.query
        .mockResolvedValueOnce([
          {
            resourceUuid: 'enc-1',
            date_created: '2026-08-04 05:18:36',
            creator: 'lab',
            date_changed: null,
            changer: null,
            voided: 0,
            date_voided: null,
            voider: null,
          },
        ])
        .mockResolvedValueOnce([]);

      const provs = (await service.provenancesForPatient('pt-1')) as AnyResource[];
      expect(provs).toHaveLength(1);
      const agent = provs[0].agent[0];
      expect(agent.requestor).toBeUndefined();
      expect(agent.type.coding[0]).toMatchObject({
        system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
        code: 'author',
      });
      expect(agent.who).toEqual({ display: 'lab' });
      expect(provs[0].activity.coding[0]).toMatchObject({
        system: 'http://terminology.hl7.org/CodeSystem/v3-DataOperation',
        code: 'CREATE',
        display: 'create',
      });
    });
  });

  describe('enrichMedicationRequest (ke-medication-request minimums)', () => {
    it('adds the prescription identifier, the outpatient category and dosage depth', async () => {
      const resource: AnyResource = {
        resourceType: 'MedicationRequest',
        id: 'mr-1',
        status: 'active',
        intent: 'order',
        medicationReference: { reference: 'Medication/med-1', display: 'ASPIRIN TAB' },
        subject: { reference: 'Patient/pt-1' },
        dosageInstruction: [
          {
            timing: {
              repeat: { duration: 30, durationUnit: 'd' },
              code: { text: 'ONCE A DAY' },
            },
            route: { text: 'ORAL ADMINISTRATION, DRUG ROUTE' },
          },
        ],
        dispenseRequest: {
          quantity: { value: 30, unit: 'TABLET, DOSAGE FORM', code: 'a8a07f8e-uuid' },
        },
      };

      await service.enrichMedicationRequest(resource as never, {});

      expect(resource.identifier).toEqual([
        {
          system: 'https://ilm-hie.dha.go.ke/fhir/NamingSystem/prescription-identifier',
          value: 'mr-1',
        },
      ]);
      expect(resource.category[0].coding[0]).toMatchObject({
        system: 'http://terminology.hl7.org/CodeSystem/medicationrequest-category',
        code: 'outpatient',
      });
      const repeat = resource.dosageInstruction[0].timing.repeat;
      expect(repeat).toMatchObject({ frequency: 1, period: 1, periodUnit: 'd' });
      expect(resource.dosageInstruction[0].route.coding[0]).toMatchObject({
        system: 'https://fhir.dha.go.ke/terminology/CodeSystem/route-of-administration-cs',
        code: 'RT10025',
        display: 'Oral',
      });
      expect(resource.dosageInstruction[0].doseAndRate[0].doseQuantity).toMatchObject({
        value: 1,
        unit: 'TABLET, DOSAGE FORM',
      });
      // qty-3: bare codes without a system are stripped
      expect(resource.dispenseRequest.quantity.code).toBeUndefined();
      expect(resource.dispenseRequest.quantity.unit).toBe('TABLET, DOSAGE FORM');
      expect(resource.authoredOn).toBeTruthy();
    });
  });

  describe('enrichCondition (kenya-core-condition)', () => {
    it('replaces statuses/category with DHA codings and normalizes the invalid unknown', async () => {
      const resource: AnyResource = {
        resourceType: 'Condition',
        id: 'cond-1',
        clinicalStatus: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
              code: 'unknown',
              display: 'Unknown',
            },
          ],
        },
        verificationStatus: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
              code: 'confirmed',
              display: 'Confirmed',
            },
          ],
        },
        category: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/condition-category',
                code: 'encounter-diagnosis',
                display: 'Encounter Diagnosis',
              },
            ],
          },
        ],
      };

      await service.enrichCondition(resource as never);

      expect(resource.clinicalStatus.coding).toHaveLength(1);
      expect(resource.clinicalStatus.coding[0]).toMatchObject({
        system: 'https://fhir.dha.go.ke/terminology/CodeSystem/condition-clinical-status-cs',
        code: 'ACTIVE',
      });
      expect(resource.verificationStatus.coding[0]).toMatchObject({
        system: 'https://fhir.dha.go.ke/terminology/CodeSystem/condition-verification-status-cs',
        code: 'CONFIRMED',
      });
      expect(resource.category[0].coding[0]).toMatchObject({
        system: 'https://fhir.dha.go.ke/terminology/CodeSystem/condition-category-cs',
        code: 'ENCOUNTER-DIAGNOSIS',
      });
      expect(resource.recordedDate).toBeTruthy();
    });
  });

  describe('enrichAllergyIntolerance (kenya-core-allergyintolerance)', () => {
    it('normalizes FHIR2 shapes to the profile minimums', async () => {
      const resource: AnyResource = {
        resourceType: 'AllergyIntolerance',
        id: 'ai-1',
        type: 'allergy',
        category: ['medication'],
        code: { text: 'ASPIRIN', coding: [{ code: 'a890c2e2', display: 'ASPIRIN' }] },
        reaction: [
          {
            substance: { coding: [{ code: 'a890c2e2', display: 'ASPIRIN' }] },
            manifestation: [{ text: 'GASTROINTESTINAL IRRITATION' }],
          },
        ],
      };

      await service.enrichAllergyIntolerance(resource as never);

      expect(resource.type).toBe('allergy');
      expect(resource.clinicalStatus.coding[0]).toMatchObject({
        system: 'https://fhir.dha.go.ke/terminology/CodeSystem/condition-clinical-status-cs',
        code: 'ACTIVE',
      });
      expect(resource.verificationStatus.coding[0]).toMatchObject({
        system: 'https://fhir.dha.go.ke/terminology/CodeSystem/condition-verification-status-cs',
        code: 'CONFIRMED',
      });
      expect(resource.criticality).toBe('unable-to-assess');
      expect(resource.recordedDate).toBeTruthy();
      expect(resource.reaction[0].severity).toBe('moderate');
      expect(resource.reaction[0].manifestation[0].coding[0]).toMatchObject({
        system: 'https://fhir.dha.go.ke/terminology/CodeSystem/manifestation-cs',
        code: 'ABDOMINAL-PAIN',
      });
    });

    it('maps the substance from the bundled snapshot when the live IG is unreachable', async () => {
      // pod egress to fhir.dha.go.ke is intermittent (staging logged
      // 'active-components-cs fetch failed: TypeError: fetch failed') — the
      // enrichment must still produce the required DHA coding
      jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

      const resource: AnyResource = {
        resourceType: 'AllergyIntolerance',
        id: 'ai-offline',
        code: { text: 'ASPIRIN', coding: [{ code: 'a890c2e2', display: 'ASPIRIN' }] },
        reaction: [
          { substance: { coding: [{ code: 'a890c2e2', display: 'ASPIRIN' }] }, manifestation: [{ text: 'RASH' }] },
        ],
      };

      await service.enrichAllergyIntolerance(resource as never);

      expect(resource.code.coding).toContainEqual({
        system: 'https://fhir.dha.go.ke/terminology/CodeSystem/active-components-cs',
        code: 'AC10262',
        display: 'Acetylsalicylic Acid',
      });
      expect(resource.reaction[0].substance.coding[0]).toMatchObject({
        code: 'AC10262',
        display: 'Acetylsalicylic Acid',
      });
      expect(global.fetch).toHaveBeenCalledTimes(1); // refresh attempted once, never blocking
    });
  });

  describe('enrichEncounter (kenya-core-encounter)', () => {
    it('maps the OpenMRS visit type to the DHA encounter-type coding', async () => {
      const resource: AnyResource = {
        resourceType: 'Encounter',
        id: 'enc-1',
        status: 'unknown',
        class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
        type: [
          {
            coding: [
              {
                system: 'http://fhir.openmrs.org/code-system/visit-type',
                code: '57d7f623',
                display: 'OPD Visit',
              },
            ],
          },
        ],
      };

      await service.enrichEncounter(resource as never);

      expect(resource.type).toHaveLength(1);
      expect(resource.type[0].coding[0]).toMatchObject({
        system: 'https://fhir.dha.go.ke/terminology/CodeSystem/encounter-type-cs',
        code: 'OUTPATIENT-VISIT',
        display: 'Outpatient Visit',
      });
      expect(resource.type[0].text).toBe('OPD Visit');
    });
  });

  describe('enrichObservation (kenya-core-observation)', () => {
    it('derives the category from the observation display', async () => {
      const vital: AnyResource = {
        resourceType: 'Observation',
        id: 'obs-vital',
        code: { text: 'SYSTOLIC BLOOD PRESSURE' },
      };
      await service.enrichObservation(vital as never);
      expect(vital.category[0].coding[0].code).toBe('vital-signs');

      const survey: AnyResource = {
        resourceType: 'Observation',
        id: 'obs-survey',
        code: { text: 'CHIEF COMPLAINT, DETAILED' },
      };
      await service.enrichObservation(survey as never);
      expect(survey.category[0].coding[0].code).toBe('survey');
    });
  });

  describe('composition (ke-kps-composition slices)', () => {
    it('uses the Patient summary Document LOINC pattern and slice-exact section codes', async () => {
      configService.get.mockImplementation((key: string) =>
        key === 'AMRS_BASE_URL' ? 'https://upstream.test' : undefined,
      );
      jest.spyOn(service as any, 'fetchFhir2Search').mockResolvedValue([]);
      caseSummaryService.getVisitCaseSummary.mockResolvedValue({
        demographics: { name: 'Demo' },
        vitals: {},
      });

      const composition = (await service.composition('pt-1', 'loc-1')) as AnyResource;

      expect(composition.type.coding[0]).toEqual({
        system: 'http://loinc.org',
        code: '60591-5',
        display: 'Patient summary Document',
      });
      expect(composition.author).toHaveLength(1);
      const sectionCodes = composition.section.map((s: AnyResource) => s.code.coding[0].code);
      for (const required of ['11450-4', '48765-2', '10160-0', '11369-6', '30954-2']) {
        expect(sectionCodes).toContain(required);
      }
      const problems = composition.section.find((s: AnyResource) => s.code.coding[0].code === '11450-4');
      expect(problems.code.coding[0].display).toBe('Problem list');
    });
  });
});
