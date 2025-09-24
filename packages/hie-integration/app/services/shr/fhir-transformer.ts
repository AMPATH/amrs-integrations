import { v4 as uuidv4 } from "uuid";
import { logger } from "../../utils/logger";
import { IdMappings, PatientData } from "./types";
import { removeFields } from "../../utils/removeFields";
import { ConceptMapper } from "./concept-mapper";

export class FhirTransformer {
  // private mappings: IdMappings;
  private conceptMapper: ConceptMapper;
  //  private conceptService: ConceptService;

  constructor() {
    this.conceptMapper = new ConceptMapper();
    // this.conceptService = conceptService;
  }

  async transform(patientData: PatientData): Promise<any> {
    const {
      patient,
      encounters,
      observationsByEncounter,
      dateContext,
    } = patientData;

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
      const transformedEncounter = await this.transformEncounter(
        encounter,
        patient
      );
      this.addBundleEntry(bundle, transformedEncounter, "Encounter");

      // Transform linked Observations
      const linkedObservations = observationsByEncounter[encounter.id] || [];
      // const sampleObservations = linkedObservations.slice(0, 5);

      for (const observation of linkedObservations) {
        const obsType = this.conceptMapper.getObservationType(observation);

        switch (obsType) {
          case "drug":
            drugObservations.push({ observation, encounter, patient });
            break;
          case "clinical-note":
            clinicalNotes.push({ observation, encounter, patient });
            break;
          case "regular":
            const transformedObs = await this.transformObservation(
              observation,
              patient,
              encounter
            );
            this.addBundleEntry(bundle, transformedObs, "Observation");
            break;
        }
      }
    }

    // Create Composition from clinical notes
    if (clinicalNotes.length > 0) {
      const composition = await this.createComposition(clinicalNotes, patient);
      this.addBundleEntry(bundle, composition, "Composition");
    }

    // Create MedicationRequest from drug observations
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

  private async transformEncounter(encounter: any, patient: any): Promise<any> {
    const transformedEncounter = { ...encounter };

    const fieldsToRemove = ["text", "partOf", "meta"];

    removeFields(transformedEncounter, fieldsToRemove);

    transformedEncounter.identifier = [
      {
        system: "http://fhir.openmrs.org",
        value: `Patient-Appointment-HLC-APP-${encounter.id}`,
      },
    ];

    // Transform patient reference - this is probably wrong since we can get CR_ID from patient resource
    const shrPatientId = "CR7671914222027-5"; //this.mappings.patientMap.get(patient.id);
    // if (!shrPatientId) {
    //   throw new Error(
    //     `No SHR patient ID mapping found for local ID: ${patient.id}`
    //   );
    // }

    transformedEncounter.subject = {
      reference: `https://cr.kenya-hie.health/api/v4/Patient/${shrPatientId}`,
      identifier: {
        system: "https://cr.kenya-hie.health/api/v4/Patient",
        value: shrPatientId,
      },
    };

    // Transform participant references
    if (transformedEncounter.participant) {
      for (const participant of transformedEncounter.participant) {
        if (participant.individual && participant.individual.reference) {
          const localPractitionerId = this.extractReferenceId(
            participant.individual,
            "Practitioner"
          );
          const shrPractitionerId = "PUID-0155222-4";
          // const shrPractitionerId = this.mappings.practitionerMap.get(
          //   localPractitionerId
          // );

          // if (!shrPractitionerId) {
          //   logger.warn(
          //     { localPractitionerId },
          //     "No SHR practitioner ID mapping found"
          //   );
          //   continue;
          // }

          participant.reference = `https://hwr.kenya-hie.health/api/v4/Practitioner/${shrPractitionerId}`;
          participant.individual = {
            identifier: [
              {
                system: "https://hwr.kenya-hie.health/api/v4/Practitioner",
                value: shrPractitionerId,
              },
            ],
          };
        }
      }
    }

    // Transform location array → serviceProvider
    if (transformedEncounter.location) {
      for (const loc of transformedEncounter.location) {
        if (loc.location && loc.location.reference) {
          const localLocId = this.extractReferenceId(loc.location, "Location");
          const shrOrgId = "FID-45-107983-8";
          // const shrOrgId = this.mappings.organizationMap.get(localLocId);

          // if (!shrOrgId) {
          //   logger.warn(
          //     { localLocId },
          //     "No SHR organization ID mapping found for location"
          //   );
          //   continue;
          // }

          transformedEncounter.serviceProvider = {
            reference: `https://fr.kenya-hie.health/api/v4/Organization/${shrOrgId}`,
            identifier: [
              {
                system: "https://fr.kenya-hie.health/api/v4/Organization",
                value: shrOrgId,
              },
            ],
          };

          delete transformedEncounter.location;

          break;
        }
      }
    }

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
    encounter: any
  ): Promise<any> {
    const transformedObs = { ...observation };

    removeFields(transformedObs, [
      "text",
      "partOf",
      "meta",
      "referenceRange",
      "hasMember",
    ]);

    const shrPatientId = "CR7671914222027-5"; // mapping logic

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

    const shrPractitionerId = "PUID-0155222-4"; // mapping logic
    transformedObs.performer = {
      reference: `https://hwr.kenya-hie.health/api/v4/Practitioner/${shrPractitionerId}`,
      identifier: [
        {
          system: "https://hwr.kenya-hie.health/api/v4/Practitioner",
          value: shrPractitionerId,
        },
      ],
    };

    return transformedObs;
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
