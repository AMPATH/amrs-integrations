
import config from "../../config/env";
import {
  FhirBundle,
  EncryptedClientResp,
} from "../../types/hie.type";
import { logger } from "../../utils/logger";
import { HieHttpClient } from "../../utils/http-client";
import { EncounterResource, MedicationRequestResource, ObservationResource } from "../../types/shr";


export class SHRService {
    private httpClient = new HieHttpClient();

    async fetchPatientFromSHR(
        cr_id: string
      ): Promise<any> {
        try {
          const response = await this.httpClient.get<FhirBundle<any>>(
            config.HIE.SHR_FETCH_URL + "?cr_id=" + cr_id
          );
          if (!response.data || !response.data.entry || response.data.entry.length === 0) {
            throw new Error("Patient not found in HIE registry");
          }
          return response.data || [];
        } catch (error: any) {
          logger.error(`HIE client registry request failed: ${error.message}`);
          throw new Error(
    
            error.response?.data
          );
        }
      }

      async postBundleToSHR(
        bundle: FhirBundle<any>
      ): Promise<any> {
        try {
          const response = await this.httpClient.post<EncryptedClientResp>(
            config.HIE.SHR_POST_BUNDLE_URL, bundle
          );
          return response.data || [];
        } catch (error: any) {
          logger.error(`HIE client registry request failed: ${error.message}`);
          throw new Error(
    
            error.response?.data
          );
        }
      }
      // async fetchLatestPatientVisitFromAMRS(
      //   patientId: string
      // ): Promise<any> {
      //   try {
      //     const response: FhirBundle<EncounterResource> = await this.amrsService.getLatestPatientVisit(patientId);
      //     return response || [];
      //   } catch (error: any) {
      //     logger.error(`AMRS encounter fetch failed: ${error.message}`);
      //     throw new Error(
      //       error.response?.data
      //     );
      //   }
      // }

      // async fetchEncounterByVisitIdFromAMRS(
      //   visitId: string
      // ): Promise<any> {
      //   try {
      //     const response: FhirBundle<EncounterResource> = await this.amrsService.getEncounterByVisitId(visitId);
      //     return response || [];
      //   } catch (error: any) {
      //     logger.error(`AMRS encounter fetch failed: ${error.message}`);
      //     throw new Error(
      //       error.response?.data
      //     );
      //   }
      // }

      // async fetchObservationByEncounterIdFromAMRS(
      //   encounterId: string
      // ): Promise<any> {
      //   try {
      //     const response: FhirBundle<ObservationResource> = await this.amrsService.getObservationByEncounterId(encounterId);
      //     return response || [];
      //   } catch (error: any) {
      //     logger.error(`AMRS observation fetch failed: ${error.message}`);
      //     throw new Error(
      //       error.response?.data
      //     );
      //   }
      // }
      // //Extract medication request from observation

      // async fetchMedicationRequestFromObservationFromAMRS(
      //   observationId: string
      // ): Promise<any> {
      //   try {
      //     const response: FhirBundle<MedicationRequestResource> = await this.amrsService.getMedicationRequestByObservationId(observationId);
      //     return response || [];
      //   } catch (error: any) {
      //     logger.error(`AMRS medication request fetch failed: ${error.message}`);
      //     throw new Error(
      //       error.response?.data
      //     );
      //   }
      // } 

      // Extract clinical note from etl* tables/summary and form the composition resource
    
}