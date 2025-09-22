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

  async search<T>(
    resourceType: string,
    params: Record<string, string> = {}
  ): Promise<any> {
    const queryString = new URLSearchParams(params).toString();
    const url = `${resourceType}?${queryString}`;

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
  ): Promise<any> { //PatientData
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
}
