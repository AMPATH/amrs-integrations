import config from "../../config/env";
import { FhirBundle, EncryptedClientResp } from "../../types/hie.type";
import { logger } from "../../utils/logger";
import { HieHttpClient } from "../../utils/http-client";
import { VisitService } from "../amrs/visit-service";
import { AmrsFhirClient } from "./amrs-fhir-client";
import { ShrFhirClient } from "./shr-fhir-client";
import { HapiFhirClient } from "./hapi-fhir-client";
import { FhirTransformer } from "./fhir-transformer";
import { IdMappings } from "./types";
import { HieMappingService } from "../amrs/hie-mapping-service";

export class SHRService {
  private httpClient: HieHttpClient;
  private visitService: VisitService;
  private amrsFhirClient: AmrsFhirClient;
  private shrFhirClient: ShrFhirClient;
  private hapiFhirClient: HapiFhirClient;
  private transformer: FhirTransformer;
  private mappingService: HieMappingService;

  constructor(facilityUuid: string) {
    this.httpClient = new HieHttpClient(config.HIE.BASE_URL, facilityUuid);
    this.visitService = new VisitService();
    this.amrsFhirClient = new AmrsFhirClient();
    this.shrFhirClient = new ShrFhirClient(facilityUuid);
    this.hapiFhirClient = new HapiFhirClient(facilityUuid);
    this.mappingService = new HieMappingService();

    this.transformer = new FhirTransformer(this.mappingService);
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

      // Transform searchset to collection bundle
      const collectionBundle = this.transformToCollectionBundle(response.data);
      
      // Post the collection bundle to OpenHIM before returning
      try {
        logger.debug(`Posting transformed bundle for patient ${cr_id} to OpenHIM`);
        await this.postBundleToOpenHIM(collectionBundle);
        logger.debug(`Successfully posted bundle for patient ${cr_id} to OpenHIM`);
      } catch (openHimError: any) {
        logger.error(`Failed to post bundle to OpenHIM for patient ${cr_id}: ${openHimError.message}`);
        // Continue execution - don't fail the entire operation if OpenHIM post fails
        // The collection bundle will still be returned for other uses
      }
      
      return collectionBundle;
    } catch (error: any) {
      logger.error(`HIE client registry request failed: ${error.message}`);
      const details =
        error.response?.data?.issue?.[0]?.diagnostics ||
        JSON.stringify(error.response?.data) ||
        error.message;

      throw new Error(`Failed to fetch patient: ${details}`);
    }
  }

  private transformToCollectionBundle(searchsetBundle: any): any {
    if (!searchsetBundle.entry || searchsetBundle.entry.length === 0) {
      return searchsetBundle;
    }

    logger.debug(`Transforming searchset bundle with ${searchsetBundle.entry.length} entries to collection bundle`);

    // For collection bundle, we keep the original structure but clean up entries
    const validEntries = searchsetBundle.entry.filter((entry: any) => {
      const resource = entry.resource;
      if (!resource?.resourceType || !this.isValidFhirResourceType(resource.resourceType)) {
        logger.debug(`Skipping invalid resource type: ${resource?.resourceType}`);
        return false;
      }
      return true;
    });

    // Remove duplicates based on resource type and identifier
    const uniqueEntries = new Map<string, any>();
    const processedIdentifiers = new Set<string>();

    validEntries.forEach((entry: any) => {
      const resource = entry.resource;
      const resourceType = resource.resourceType;
      const originalId = resource.id;

      // Create a unique key for this resource to avoid duplicates
      let resourceKey = '';
      if (resource.identifier && Array.isArray(resource.identifier) && resource.identifier.length > 0) {
        const primaryIdentifier = resource.identifier[0];
        if (primaryIdentifier.system && primaryIdentifier.value) {
          resourceKey = `${resourceType}|${primaryIdentifier.system}|${primaryIdentifier.value}`;
        }
      }

      // If no identifier-based key, use resourceType/id
      if (!resourceKey && originalId) {
        resourceKey = `${resourceType}/${originalId}`;
      }

      // Skip if we've already processed this resource
      if (resourceKey && processedIdentifiers.has(resourceKey)) {
        logger.debug(`Skipping duplicate resource: ${resourceKey}`);
        return;
      }

      if (resourceKey) {
        processedIdentifiers.add(resourceKey);
      }

      // Use original fullUrl or generate one based on resource type and id
      let fullUrl = entry.fullUrl;
      if (!fullUrl && originalId) {
        fullUrl = `${resourceType}/${originalId}`;
      }

      const collectionEntry: any = {
        fullUrl: fullUrl,
        resource: resource
      };

      // Add request information if it exists, otherwise use search as fallback
      if (entry.request) {
        collectionEntry.request = entry.request;
      } else if (entry.search) {
        collectionEntry.request = {
          method: "POST",
          url: resource.resourceType
        };
      }

      uniqueEntries.set(resourceKey || fullUrl, collectionEntry);
    });

    // Create collection bundle
    const collectionBundle = {
      resourceType: "Bundle",
      type: "collection",
      timestamp: new Date().toISOString(),
      entry: Array.from(uniqueEntries.values())
    };

    logger.debug(`Created collection bundle with ${collectionBundle.entry.length} unique entries`);
    
    return collectionBundle;
  }

  private isValidFhirResourceType(resourceType: string): boolean {
    const validResourceTypes = [
      'Patient', 'Practitioner', 'Organization', 'Location', 'HealthcareService',
      'Encounter', 'Condition', 'Procedure', 'Observation', 'DiagnosticReport',
      'ServiceRequest', 'MedicationRequest', 'MedicationDispense', 'MedicationStatement',
      'AllergyIntolerance', 'CarePlan', 'Goal', 'Immunization', 'Coverage',
      'Claim', 'Composition', 'DocumentReference', 'Binary', 'Bundle',
      'EpisodeOfCare', 'Device', 'Specimen', 'Media', 'Group'
    ];
    
    return validResourceTypes.includes(resourceType);
  }

  async postBundleToOpenHIM(bundle: any): Promise<any> {
    try {
      const openHimUrl = `${config.HIE.OPENHIM_BASE_URL}${config.HIE.OPENHIM_FHIR_ENDPOINT}`;
      
      logger.debug(`Posting transaction bundle to OpenHIM FHIR endpoint: ${openHimUrl}`);
      
      // Use fetch for OpenHIM with custom headers
      const authHeaders = {
        'Authorization': `Basic ${Buffer.from(`${config.HIE.OPENHIM_USERNAME}:${config.HIE.OPENHIM_PASSWORD}`).toString('base64')}`,
        'Content-Type': 'application/fhir+json',
        'Accept': 'application/fhir+json'
      };

      const response = await fetch(openHimUrl, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(bundle)
      });

      logger.debug(`Successfully posted bundle to OpenHIM. Response status: ${response.status}`);
      
      return await response.json();
    } catch (error: any) {
      logger.error(`Failed to post bundle to OpenHIM: ${error.message}`);
      const details = error.response?.data?.issue?.[0]?.diagnostics || 
                    JSON.stringify(error.response?.data) || 
                    error.message;
      throw new Error(`Failed to post bundle to OpenHIM: ${details}`);
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

  async postBundleToHapi(bundle: FhirBundle<any>): Promise<any> {
    try {
      const response = await this.hapiFhirClient.postBundle(bundle);
      logger.info(`Bundle posted to HAPI FHIR successfully`, {
        bundleId: bundle.id,
      });
      return response;
    } catch (error: any) {
      logger.error(`Failed to post bundle to HAPI FHIR: ${error.message}`);
      throw new Error(`Failed to post bundle to HAPI FHIR: ${error.message}`);
    }
  }

  async sendToDeadLetterQueue(deadLetterPayload: any): Promise<any> {
    try {
      const response = await this.httpClient.post(
        "/kafka-dead-letter",
        deadLetterPayload
      );
      logger.info(`Dead letter payload sent successfully`, {
        eventId: deadLetterPayload.originalEvent?.id,
      });
      return response.data;
    } catch (error: any) {
      logger.error(`Failed to send to dead letter queue: ${error.message}`);
      throw new Error(`Failed to send to dead letter queue: ${error.message}`);
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
      // get the practitioner and facilty from amrs using both location uuid and provider uuid

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
