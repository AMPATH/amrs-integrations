import { v4 as uuidv4 } from "uuid";
import { logger } from "../../utils/logger";
import { IdMappings, PatientData } from "./types";
import { removeFields } from "../../utils/removeFields";

export class FhirTransformer {
  private mappings: IdMappings;

  constructor(mappings: IdMappings) {
    this.mappings = mappings;
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
      type: "batch",
      timestamp: new Date().toISOString(),
      entry: [],
    };

    for (const encounter of encounters) {
      // Transform Encounter
      const transformedEncounter = await this.transformEncounter(
        encounter,
        patient
      );
      this.addBundleEntry(bundle, transformedEncounter, "Encounter");

      // Transform linked Observations
      const linkedObservations = observationsByEncounter[encounter.id] || [];
          const sampleObservations = linkedObservations.slice(0, 5);

      for (const observation of sampleObservations) {
        const transformedObs = await this.transformObservation(
          observation,
          patient,
          encounter
        );
        this.addBundleEntry(bundle, transformedObs, "Observation");
      }
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
        url: "Patient",//resourceType,
      },
    };

    if (resourceType === "Observation" && patientId) {
      entry.patient = patientId;
    }

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

  private async transformMedicationRequest(
    medRequest: any,
    patient: any
  ): Promise<any> {
    const transformedMedReq = { ...medRequest };

    const shrPatientId = this.mappings.patientMap.get(patient.id);
    if (!shrPatientId) {
      throw new Error(
        `No SHR patient ID mapping found for local ID: ${patient.id}`
      );
    }

    transformedMedReq.subject = {
      reference: `https://cr.kenya-hie.health/api/v4/Patient/${shrPatientId}`,
      type: "Patient",
      identifier: {
        use: "official",
        system: "https://cr.kenya-hie.health/api/v4/Patient",
        value: shrPatientId,
      },
    };

    if (transformedMedReq.requester && transformedMedReq.requester.reference) {
      const localPractitionerId = this.extractReferenceId(
        transformedMedReq.requester,
        "Practitioner"
      );
      const shrPractitionerId = this.mappings.practitionerMap.get(
        localPractitionerId
      );

      if (shrPractitionerId) {
        transformedMedReq.requester = {
          reference: `https://hwr.kenya-hie.health/api/v4/Practitioner/${shrPractitionerId}`,
          type: "Practitioner",
          identifier: {
            system: "https://hwr.kenya-hie.health/api/v4/Practitioner",
            value: shrPractitionerId,
          },
        };
      }
    }

    return transformedMedReq;
  }
}
