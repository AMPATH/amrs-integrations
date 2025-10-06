import { v4 as uuidv4 } from "uuid";
import { logger } from "../../utils/logger";
import { IdMappings, PatientData } from "./types";
import { removeFields } from "../../utils/removeFields";
import { ConceptMapper } from "./concept-mapper";
import { HieMappingService } from "../amrs/hie-mapping-service";

type EncounterMapping = {
  practitionerId?: string;
  facilityId?: string;
};

export class FhirTransformer {
  // private mappings: IdMappings;
  private conceptMapper: ConceptMapper;
  private mappingService: HieMappingService;
  //  private conceptService: ConceptService;

  constructor(mappingService: HieMappingService) {
    this.conceptMapper = new ConceptMapper();
    this.mappingService = mappingService;
    // this.conceptService = conceptService;
  }

  async transform(patientData: PatientData): Promise<any> {
    const { patient, encounters, observationsByEncounter } = patientData;

    // Step 1: Extract unique practitioner and location UUIDs from encounters
    const {
      practitionerUuids,
      locationUuids,
    } = this.extractUuidsFromEncounters(encounters);

    // Step 2: Batch fetch all mappings in parallel
    const [practitionerMap, facilityMap] = await Promise.all([
      this.mappingService.getShrPractitionerIds(practitionerUuids),
      this.mappingService.getShrFacilityIds(locationUuids),
    ]);

    // Step 3: Create encounter mapping for quick lookup
    const encounterMappings = this.createEncounterMappings(
      encounters,
      practitionerMap,
      facilityMap
    );

    // Step 4: Proceed with transformation
    const bundle = await this.buildBundle(
      patient,
      encounters,
      observationsByEncounter,
      encounterMappings
    );

    return bundle;
  }

  private extractUuidsFromEncounters(
    encounters: any[]
  ): { practitionerUuids: string[]; locationUuids: string[] } {
    const practitionerUuids = new Set<string>();
    const locationUuids = new Set<string>();

    for (const encounter of encounters) {
      if (encounter.participant?.[0]?.individual?.reference) {
        const practitionerUuid = this.extractReferenceId(
          encounter.participant[0].individual,
          "Practitioner"
        );
        practitionerUuids.add(practitionerUuid);
      }

      if (encounter.location?.[0]?.location?.reference) {
        const locationUuid = this.extractReferenceId(
          encounter.location[0].location,
          "Location"
        );
        locationUuids.add(locationUuid);
      }
    }

    return {
      practitionerUuids: Array.from(practitionerUuids),
      locationUuids: Array.from(locationUuids),
    };
  }

  private createEncounterMappings(
    encounters: any[],
    practitionerMap: Map<string, string>,
    facilityMap: Map<string, string>
  ): Map<string, EncounterMapping> {
    const mappings: Map<string, EncounterMapping> = new Map();

    for (const encounter of encounters) {
      const mapping: EncounterMapping = {};

      if (encounter.participant?.[0]?.individual?.reference) {
        const practitionerUuid = this.extractReferenceId(
          encounter.participant[0].individual,
          "Practitioner"
        );
        mapping.practitionerId = practitionerMap.get(practitionerUuid);

        if (!mapping.practitionerId) {
          logger.warn(
            { encounterId: encounter.id, practitionerUuid },
            "No SHR practitioner ID mapping found for encounter"
          );
        }
      }

      if (encounter.location?.[0]?.location?.reference) {
        const locationUuid = this.extractReferenceId(
          encounter.location[0].location,
          "Location"
        );
        mapping.facilityId = facilityMap.get(locationUuid);

        if (!mapping.facilityId) {
          logger.warn(
            { encounterId: encounter.id, locationUuid },
            "No SHR facility ID mapping found for encounter"
          );
        }
      }

      mappings.set(encounter.id, mapping);
    }

    return mappings;
  }

  private async buildBundle(
    patient: any,
    encounters: any[],
    observationsByEncounter: Record<string, any[]>,
    encounterMappings: Map<string, EncounterMapping>
  ): Promise<any> {
    const bundle: any = {
      resourceType: "Bundle",
      id: `batch-${uuidv4()}`,
      type: "collection",
      timestamp: new Date().toISOString(),
      entry: [],
    };

    const clinicalNotes: any[] = [];
    const drugObservations: any[] = [];

    for (const encounter of encounters) {
      const mapping = encounterMappings.get(encounter.id);

      const transformedEncounter = await this.transformEncounter(
        encounter,
        patient,
        mapping
      );
      this.addBundleEntry(bundle, transformedEncounter, "Encounter");

      const linkedObservations = observationsByEncounter[encounter.id] || [];
      for (const observation of linkedObservations) {
        const obsType = this.conceptMapper.getObservationType(observation);

        switch (obsType) {
          case "drug":
            drugObservations.push({ observation, encounter, patient, mapping });
            break;
          case "clinical-note":
            clinicalNotes.push({ observation, encounter, patient, mapping });
            break;
          case "regular":
            const transformedObs = await this.transformObservation(
              observation,
              patient,
              encounter,
              mapping
            );
            this.addBundleEntry(bundle, transformedObs, "Observation");
            break;
        }
      }
    }

    if (clinicalNotes.length > 0) {
      const composition = await this.createComposition(clinicalNotes, patient);
      this.addBundleEntry(bundle, composition, "Composition");
    }

    for (const drugData of drugObservations) {
      const medicationRequest = await this.createMedicationRequest(drugData);
      this.addBundleEntry(bundle, medicationRequest, "MedicationRequest");
    }

    logger.debug(
      {
        patient: patient.id,
        entries: bundle.entry.length,
      },
      "Bundle transformed successfully"
    );

    return bundle;
  }

  private addBundleEntry(
    bundle: any,
    resource: any,
    resourceType: string,
    patientId?: string
  ): void {
    const entry: any = {
      fullUrl: `urn:uuid:${resource.id}`,
      resource,
      request: {
        method: "POST",
        url: resourceType,
      },
    };

    // if (resourceType === "Observation" && patientId) {
    //   entry.patient = patientId;
    // }

    bundle.entry.push(entry);
  }

  private extractReferenceId(reference: any, expectedType: string): string {
    if (!reference.reference) {
      throw new Error(`Missing reference for ${expectedType}`);
    }

    const [type, id] = reference.reference.split("/");
    if (type !== expectedType) {
      throw new Error(`Expected reference type ${expectedType}, got ${type}`);
    }

    return id;
  }

  private async transformEncounter(
    encounter: any,
    patient: any,
    mapping?: EncounterMapping 
  ): Promise<any> {
    const transformedEncounter = { ...encounter };

    // Remove unnecessary fields
    const fieldsToRemove = ["text", "partOf", "meta"];
    removeFields(transformedEncounter, fieldsToRemove);

    // Set identifiers
    transformedEncounter.identifier = [
      {
        system: "http://fhir.openmrs.org",
        value: `Patient-Appointment-HLC-APP-${encounter.id}`,
      },
    ];

    // Transform patient reference (you'll need to implement patient mapping logic)
    const shrPatientId = await this.getShrPatientId(patient.id);
    transformedEncounter.subject = {
      reference: `https://cr.kenya-hie.health/api/v4/Patient/${shrPatientId}`,
      identifier: {
        system: "https://cr.kenya-hie.health/api/v4/Patient",
        value: shrPatientId,
      },
    };

    // Transform practitioner references
    if (transformedEncounter.participant && mapping?.practitionerId) {
      for (const participant of transformedEncounter.participant) {
        participant.reference = `https://hwr.kenya-hie.health/api/v4/Practitioner/${mapping.practitionerId}`;
        participant.individual = {
          identifier: [
            {
              system: "https://hwr.kenya-hie.health/api/v4/Practitioner",
              value: mapping.practitionerId,
            },
          ],
        };
      }
    }

    // Transform location to serviceProvider
    if (mapping?.facilityId) {
      transformedEncounter.serviceProvider = {
        reference: `https://fr.kenya-hie.health/api/v4/Organization/${mapping.facilityId}`,
        identifier: [
          {
            system: "https://fr.kenya-hie.health/api/v4/Organization",
            value: mapping.facilityId,
          },
        ],
      };
      delete transformedEncounter.location;
    }

    // Set encounter class
    transformedEncounter.class = {
      system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
      code: "OP",
      display: "outpatient encounter",
    };

    return transformedEncounter;
  }

  private async transformObservation(
    observation: any,
    patient: any,
    encounter: any,
    mapping?: EncounterMapping 
  ): Promise<any> {
    const transformedObs = { ...observation };

    removeFields(transformedObs, [
      "text",
      "partOf",
      "meta",
      "referenceRange",
      "hasMember",
    ]);

    // Transform patient reference
    const shrPatientId = await this.getShrPatientId(patient.id);
    transformedObs.subject = {
      reference: `https://cr.kenya-hie.health/api/v4/Patient/${shrPatientId}`,
      type: "Patient",
      identifier: {
        use: "official",
        system: "https://cr.kenya-hie.health/api/v4/Patient",
        value: shrPatientId,
      },
    };

    // Include encounter reference
    transformedObs.encounter = {
      reference: `urn:uuid:${encounter.id}`,
    };

    // Use the same practitioner as the parent encounter
    if (mapping?.practitionerId) {
      transformedObs.performer = [
        {
          reference: `https://hwr.kenya-hie.health/api/v4/Practitioner/${mapping.practitionerId}`,
          identifier: [
            {
              system: "https://hwr.kenya-hie.health/api/v4/Practitioner",
              value: mapping.practitionerId,
            },
          ],
        },
      ];
    }

    return transformedObs;
  }

  private async getShrPatientId(amrsPatientUuid: string): Promise<string> {
    // TODO: Implement patient ID mapping logic
    // For now, return a placeholder or implement your patient mapping
    return "CR7671914222027-5"; // This should come from your patient mapping service
  }

  private async createComposition(
    clinicalNotesData: Array<{
      observation: any;
      encounter: any;
      patient: any;
    }>,
    patient: any
  ): Promise<any> {
    if (clinicalNotesData.length === 0) {
      throw new Error("No clinical notes provided for composition");
    }

    const primaryNote = clinicalNotesData[0].observation;
    const primaryEncounter = clinicalNotesData[0].encounter;

    const loincCoding = primaryNote.code?.coding?.find(
      (coding: any) => coding.system === "http://loinc.org"
    );

    const compositionType = loincCoding
      ? {
          coding: [
            {
              system: "http://loinc.org",
              code: loincCoding.code,
              display: loincCoding.display || "Clinical Note",
            },
          ],
          text: primaryNote.code?.text || "Clinical Note",
        }
      : {
          coding: [
            {
              system: "http://loinc.org",
              code: "34109-9", // Fallback to generic note
              display: "Note",
            },
          ],
          text: "Clinical Note",
        };

    const notesText = clinicalNotesData
      .map((data) => this.extractNoteText(data.observation))
      .join("\n\n");

    return {
      resourceType: "Composition",
      id: uuidv4(),
      status: "final",
      type: compositionType,
      category: [
        {
          coding: [
            {
              system: "http://loinc.org",
              code: "11488-4",
              display: "Consult note",
            },
          ],
        },
      ],
      subject: {
        reference: `https://cr.kenya-hie.health/api/v4/Patient/CR7671914222027-5`,
        identifier: [
          {
            system: "https://cr.kenya-hie.health/api/v4/Patient",
            value: "CR7671914222027-5",
          },
        ],
      },
      date: primaryEncounter.period?.start || new Date().toISOString(),
      author: [
        {
          provider: {
            individual: {
              reference:
                "https://hwr.kenya-hie.health/api/v4/Practitioner/PUID-0155222-4",
              identifier: [
                {
                  system: "https://hwr.kenya-hie.health/api/v4/Practitioner",
                  value: "PUID-0155222-4",
                },
              ],
            },
          },
        },
      ],
      title: `Clinical Notes - ${primaryEncounter.id}`,
      section: [
        {
          title: "Clinical Notes",
          code: compositionType,
          text: {
            status: "generated",
            display: `<div xmlns="http://www.w3.org/1999/xhtml">${this.escapeHtml(
              notesText
            )}</div>`,
          },
        },
      ],
    };
  }

  private async createMedicationRequest(drugData: {
    observation: any;
    encounter: any;
    patient: any;
  }): Promise<any> {
    const { observation, encounter } = drugData;
    const drugCoding = observation.valueCodeableConcept?.coding?.[0];

    const arvDefaults = {
      frequency: 1, // Once daily for ARVs
      period: 1,
      periodUnit: "d",
      duration: 1,
      durationUnit: "h",
      doseQuantity: 1,
      doseUnit: "TABS",
      doseCode: "1513AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      routeCode: "160240",
      routeDisplay: "Oral",
      frequencyCode: "OD",
      frequencyDisplay: "Once daily",
    };

    const dosageText = `Take ${arvDefaults.doseQuantity} ${
      arvDefaults.doseUnit
    } of ${drugCoding?.display || "ARV medication"} ${
      arvDefaults.frequencyDisplay
    }.`;

    return {
      resourceType: "MedicationRequest",
      id: uuidv4(),
      meta: {
        profile: ["http://hl7.org/fhir/StructureDefinition/patient-diagnosis"],
      },
      identifier: [
        {
          use: "official",
          system: "http://fhir.openmrs.org",
          value: observation.id,
        },
      ],
      status: "active",
      intent: "order",
      priority: "routine",
      medicationCodeableConcept: {
        coding: observation.valueCodeableConcept?.coding || [],
        text:
          observation.valueCodeableConcept?.text ||
          drugCoding?.display ||
          "ARV Medication",
      },
      subject: {
        reference: `https://cr.kenya-hie.health/api/v4/Patient/CR7671914222027-5`,
        type: "Patient",
        identifier: {
          use: "official",
          system: "https://cr.kenya-hie.health/api/v4/Patient",
          value: "CR7671914222027-5",
        },
      },
      encounter: {
        reference: `urn:uuid:${encounter.id}`,
      },
      requester: {
        reference:
          "https://hwr.kenya-hie.health/api/v4/Practitioner/PUID-0155222-4",
        type: "Practitioner",
        identifier: {
          system: "https://hwr.kenya-hie.health/api/v4/Practitioner",
          value: "PUID-0155222-4",
        },
      },
      authoredOn: observation.effectiveDateTime || encounter.period?.start,
      dosageInstruction: [
        {
          text: dosageText,
          timing: {
            repeat: {
              frequency: arvDefaults.frequency,
              period: arvDefaults.period,
              periodUnit: arvDefaults.periodUnit,
              duration: arvDefaults.duration,
              durationUnit: arvDefaults.durationUnit,
            },
            code: {
              coding: [
                {
                  system: "https://openconceptlab.org/orgs/CIEL/sources/CIEL",
                  code: arvDefaults.frequencyCode,
                  display: arvDefaults.frequencyDisplay,
                },
              ],
              text: arvDefaults.frequencyDisplay,
            },
          },
          asNeededBoolean: false,
          route: {
            coding: [
              {
                system: "https://openconceptlab.org/orgs/CIEL/sources/CIEL",
                code: arvDefaults.routeCode,
                display: arvDefaults.routeDisplay,
              },
            ],
            text: arvDefaults.routeDisplay,
          },
          doseAndRate: [
            {
              doseQuantity: {
                value: arvDefaults.doseQuantity,
                unit: arvDefaults.doseUnit,
                code: arvDefaults.doseCode,
              },
            },
          ],
        },
      ],
      dispenseRequest: {
        validityPeriod: {
          start: observation.effectiveDateTime || encounter.period?.start,
        },
        numberOfRepeatsAllowed: 0,
        quantity: {
          value: arvDefaults.doseQuantity,
          unit: arvDefaults.doseUnit,
          code: arvDefaults.doseCode,
        },
      },
      note: [
        {
          authorString: "PUID-0155222-4",
          time: observation.effectiveDateTime || encounter.period?.start,
          text: `Oral ${drugCoding?.display || "ARV medication"} ${
            arvDefaults.doseQuantity
          } for ${arvDefaults.duration} Hour(s) ${
            arvDefaults.frequencyDisplay
          } dose`,
        },
      ],
    };
  }

  private extractNoteText(observation: any): string {
    return (
      observation.valueString ||
      observation.valueCodeableConcept?.text ||
      observation.code?.text ||
      "Clinical note"
    );
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
