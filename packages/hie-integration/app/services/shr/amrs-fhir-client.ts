import { logger } from "../../utils/logger";
import { PatientData } from "./types";
import config from "../../config/env";
import { BasicHttpClient } from "../../utils/BasicHttpClient";

export class AmrsFhirClient {
  private httpClient: BasicHttpClient;

  constructor() {
    this.httpClient = new BasicHttpClient(
      config.AMRS_FHIR.BASE_URL,
      config.AMRS.USERNAME,
      config.AMRS.PASSWORD
    );
  }

  // async search<T>(
  //   resourceType: string,
  //   params: Record<string, string> = {}
  // ): Promise<any> {
  //   const queryString = new URLSearchParams(params).toString();
  //   const url = `${resourceType}?${queryString}`;

  //   logger.debug({ url }, `AMRS FHIR GET request`);

  //   try {
  //     const response = await this.httpClient.get(url);
  //     return response.data;
  //   } catch (error: any) {
  //     logger.error({ error, resourceType, params }, "AMRS FHIR Search failed");
  //     throw new Error(`Failed to search for ${resourceType}: ${error.message}`);
  //   }
  // }

  async search<T>(
    resourceType: string,
    params: Record<string, string | string[]> = {}
  ): Promise<any> {
    const searchParams = new URLSearchParams();

    for (const key in params) {
      const value = params[key];
      if (Array.isArray(value)) {
        value.forEach((v) => searchParams.append(key, v));
      } else {
        searchParams.append(key, value);
      }
    }

    const url = `${resourceType}?${searchParams.toString()}`;
    logger.debug({ url }, `AMRS FHIR GET request`);

    try {
      const response = await this.httpClient.get(url);
      return response.data;
    } catch (error: any) {
      logger.error({ error, resourceType, params }, "AMRS FHIR Search failed");
      throw new Error(`Failed to search for ${resourceType}: ${error.message}`);
    }
  }

  async getResource<T>(resourceType: string, id: string): Promise<T> {
    const url = `${resourceType}/${id}`;

    try {
      const response = await this.httpClient.get<T>(url);
      return response.data;
    } catch (error: any) {
      logger.error(
        { error, resourceType, id },
        "AMRS FHIR Get Resource failed"
      );
      throw new Error(`Failed to get ${resourceType}/${id}: ${error.message}`);
    }
  }

  async getPatientDataForDate(
    patientUuid: string,
    dateString: string
  ): Promise<any> {
    //PatientData
    logger.debug(
      { patientUuid, date: dateString },
      "Fetching all FHIR data for patient and date"
    );

    try {
      const [
        encountersBundle,
        observationsBundle,
        // medicationRequestsBundle,
      ] = await Promise.all([
        this.search("Encounter", {
          patient: patientUuid,
          date: `eq${dateString}`,
        }),
        this.search("Observation", {
          patient: patientUuid, // to be changed to encounter uuid
          date: `eq${dateString}`,
        }),
        // this.search("MedicationRequest", {
        //   patient: patientUuid,
        //   authoredon: `eq${dateString}`,
        // }),
      ]);

      const patient = await this.getResource<any>("Patient", patientUuid);

      return {
        patient,
        encounters: encountersBundle.entry?.map((e: any) => e.resource) || [],
        observations:
          observationsBundle.entry?.map((e: any) => e.resource) || [],
        // medicationRequests:
        //   medicationRequestsBundle.entry?.map((e: any) => e.resource) || [],
        dateContext: dateString,
      };
    } catch (error: any) {
      logger.error(
        { error, patientUuid, date: dateString },
        "Failed to get patient data for date"
      );
      throw new Error(
        `Failed to get patient data for ${patientUuid} on ${dateString}: ${error.message}`
      );
    }
  }

  //_revinclude approach
  async getPatientDataForDateRevApproach(
    patientUuid: string,
    dateString: string
  ): Promise<any> {
    logger.debug(
      { patientUuid, date: dateString },
      "Fetching all FHIR data for patient and date with _revinclude"
    );

    try {
      const nextDate = new Date(
        new Date(dateString).getTime() + 24 * 60 * 60 * 1000
      )
        .toISOString()
        .split("T")[0];

      const encountersBundle = await this.search("Encounter", {
        patient: patientUuid,
        _revinclude: "Observation:encounter",
        date: [`ge${dateString}`, `lt${nextDate}`],
      });

      const patient = await this.getResource<any>("Patient", patientUuid);

      const encounters: any[] = [];
      const observationsByEncounter: Record<string, any[]> = {};

      for (const entry of encountersBundle.entry || []) {
        const resource = entry.resource;
        if (!resource) continue;

        if (resource.resourceType === "Encounter") {
          encounters.push(resource);
          observationsByEncounter[resource.id] = [];
        } else if (
          resource.resourceType === "Observation" &&
          resource.encounter
        ) {
          const encounterId = resource.encounter.reference.split("/")[1];
          if (!observationsByEncounter[encounterId]) {
            observationsByEncounter[encounterId] = [];
          }
          observationsByEncounter[encounterId].push(resource);
        }
      }

      return {
        patient,
        encounters,
        observationsByEncounter,
        dateContext: dateString,
      };
    } catch (error: any) {
      logger.error(
        { error, patientUuid, date: dateString },
        "Failed to get patient data for date with _revinclude"
      );
      throw new Error(
        `Failed to get patient data for ${patientUuid} on ${dateString}: ${error.message}`
      );
    }
  }
}
