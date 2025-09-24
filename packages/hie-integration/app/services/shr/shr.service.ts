import config from "../../config/env";
import { FhirBundle, EncryptedClientResp } from "../../types/hie.type";
import { logger } from "../../utils/logger";
import { HieHttpClient } from "../../utils/http-client";
import { VisitService } from "../amrs/visit-service";
import { AmrsFhirClient } from "./amrs-fhir-client";
import { ShrFhirClient } from "./shr-fhir-client";
import { FhirTransformer } from "./fhir-transformer";
import { IdMappings } from "./types";

export class SHRService {
  private httpClient = new HieHttpClient(config.HIE.BASE_URL);
  private visitService: VisitService;
  private amrsFhirClient: AmrsFhirClient;
  private shrFhirClient: ShrFhirClient;
  private transformer: FhirTransformer;

  constructor() {
    this.visitService = new VisitService();
    this.amrsFhirClient = new AmrsFhirClient();
    this.shrFhirClient = new ShrFhirClient();
    // this.conceptService = new ConceptService();

    // pROBALY we might NEED to implement this mapping service or not
    const idMappings: IdMappings = {
      patientMap: new Map(),
      practitionerMap: new Map(),
      organizationMap: new Map(),
    };

    this.transformer = new FhirTransformer();
  }

  async fetchPatientFromSHR(cr_id: string): Promise<any> {
    try {
      const response = await this.httpClient.get<FhirBundle<any>>(
        config.HIE.SHR_FETCH_URL + "?cr_id=" + cr_id
      );
      if (
        !response.data ||
        !response.data.entry ||
        response.data.entry.length === 0
      ) {
        throw new Error("Patient not found in HIE registry");
      }
      return response.data || [];
    } catch (error: any) {
      logger.error(`HIE client registry request failed: ${error.message}`);
      const details =
        error.response?.data?.issue?.[0]?.diagnostics ||
        JSON.stringify(error.response?.data) ||
        error.message;

      throw new Error(`Failed to fetch patient: ${details}`);
    }
  }

  async postBundleToSHR(bundle: FhirBundle<any>): Promise<any> {
    try {
      const response = await this.httpClient.post<EncryptedClientResp>(
        config.HIE.SHR_POST_BUNDLE_URL,
        bundle
      );
      return response.data || [];
    } catch (error: any) {
      logger.error(`HIE client registry request failed: ${error.message}`);
      throw new Error(error.response?.data);
    }
  }

  async testPatientBundle(
    patientUuid: string,
    dateString?: string
  ): Promise<any> {
    const processingDate = dateString ? new Date(dateString) : new Date();
    const targetDate =
      dateString || processingDate.setDate(processingDate.getDate() - 1);
    const formattedDate = new Date(targetDate).toISOString().split("T")[0];

    logger.info(
      { patientUuid, date: formattedDate },
      "Testing bundle generation for single patient"
    );

    try {
      const patientData = await this.amrsFhirClient.getPatientDataForDate(
        patientUuid,
        formattedDate
      );

      const shrBundle = await this.transformer.transform(patientData);
      // console.log("shrBundle", JSON.stringify(shrBundle, null, 2));

      return shrBundle;
      // const response = await this.shrFhirClient.postBundle(shrBundle);
      // console.log("-------------------------------");
      // console.log("response", JSON.stringify(response, null, 2));

      // logger.info(
      //   {
      //     patientUuid,
      //     date: formattedDate,
      //     bundleEntries: shrBundle.entry.length,
      //   },
      //   "Successfully generated test bundle for patient"
      // );

      // return {
      //   success: true,
      //   patientUuid,
      //   date: formattedDate,
      //   bundle: shrBundle,
      // };
    } catch (error) {
      logger.error(
        { error, patientUuid, date: formattedDate },
        "Failed to generate test bundle for patient"
      );
      throw error;
    }
  }

  async executeBatchJob(
    jobDate: Date = new Date()
  ): Promise<{ success: boolean; processedPatients: number }> {
    // await this.conceptService.initializeConceptCache();

    const processingDate = new Date(jobDate);
    processingDate.setDate(processingDate.getDate() - 1); // def yesterday
    const dateString = processingDate.toISOString().split("T")[0];

    logger.info({ date: dateString }, "Starting SHR batch job for date");

    try {
      // 1. Get patient IDs from AMRS
      const patientVisitMap = await this.visitService.findClosedVisitsForDate(
        dateString
      );
      const patientUuids = Array.from(patientVisitMap.keys());

      // Initialize transformer with concept service
      // const transformer = new FhirTransformer(this.conceptService);

      logger.info(
        { count: patientUuids.length },
        `Processing data for ${patientUuids.length} patients`
      );

      // 2. Process each patient
      for (const patientUuid of patientUuids) {
        try {
          const patientData = await this.amrsFhirClient.getPatientDataForDate(
            patientUuid,
            dateString
          );
          const shrBundle = await this.transformer.transform(patientData);
          const response = await this.shrFhirClient.postBundle(shrBundle);
          this.validateBundleResponse(response, patientUuid);
        } catch (patientError) {
          logger.error(
            { error: patientError, patientUuid, date: dateString },
            `Failed to process patient ${patientUuid} for date ${dateString}`
          );
          // TODO: Implement retry mechanism or store somwheere
        }
      }

      logger.info("SHR Batch Job completed successfully");
      return { success: true, processedPatients: patientUuids.length };
    } catch (error) {
      logger.fatal({ error }, "SHR Batch Job failed catastrophically");
      throw error;
    }
  }

  private async processPatientForDate(
    patientUuid: string,
    dateString: string
  ): Promise<void> {
    logger.debug(
      { patientUuid, date: dateString },
      `Starting processing for patient`
    );

    // 1. Get ALL data for this patient for the specific date via FHIR
    const patientData = await this.amrsFhirClient.getPatientDataForDate(
      patientUuid,
      dateString
    );

    // 2. Transform the collected data into the SHR Bundle format
    const shrBundle = await this.transformer.transform(patientData);

    // 3. Push the bundle to the SHR
    const response = await this.shrFhirClient.postBundle(shrBundle);

    // 4. Check response for errors
    this.validateBundleResponse(response, patientUuid);

    logger.info(
      { patientUuid, date: dateString },
      `Successfully pushed bundle for patient`
    );
  }

  private validateBundleResponse(
    bundleResponse: any,
    patientUuid: string
  ): void {
    if (!bundleResponse.entry) {
      logger.warn({ patientUuid }, "SHR Bundle response has no entries");
      return;
    }

    for (const entry of bundleResponse.entry) {
      if (entry.response && entry.response.status.startsWith("4")) {
        logger.warn(
          { patientUuid, entry },
          `SHR rejected an entry in the bundle (4xx error)`
        );
      } else if (entry.response && entry.response.status.startsWith("5")) {
        logger.error(
          { patientUuid, entry },
          `SHR failed to process an entry in the bundle (5xx error)`
        );
      }
    }
  }
}
