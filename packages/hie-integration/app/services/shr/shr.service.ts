import config from "../../config/env";
import {
  FhirBundle,
  EncryptedClientResp,
  EncodedFhirResponse,
} from "../../types/hie.type";
import { logger } from "../../utils/logger";
import { HieHttpClient } from "../../utils/http-client";
import { VisitService } from "../amrs/visit-service";
import { AmrsFhirClient } from "./amrs-fhir-client";
import { ShrFhirClient } from "./shr-fhir-client";
import { HapiFhirClient } from "./hapi-fhir-client";
import { FhirTransformer } from "./fhir-transformer";
import { IdMappings } from "./types";
import { HieMappingService } from "../amrs/hie-mapping-service";
import { decryptData } from "../../utils/descrypt-data";

export class SHRService {
  private httpClient: HieHttpClient;
  private openHIM: HieHttpClient;
  private visitService: VisitService;
  private amrsFhirClient: AmrsFhirClient;
  private shrFhirClient: ShrFhirClient;
  private hapiFhirClient: HapiFhirClient;
  private transformer: FhirTransformer;
  private mappingService: HieMappingService;

  constructor(locationUuid: string) {
    logger.info("Initializing SHRService", { locationUuid });
    this.httpClient = new HieHttpClient(config.HIE.BASE_URL, locationUuid);
    this.openHIM = new HieHttpClient(config.HIE.OPENHIM_BASE_URL, locationUuid);
    this.httpClient = new HieHttpClient(config.HIE.BASE_URL, locationUuid);
    this.visitService = new VisitService();
    this.amrsFhirClient = new AmrsFhirClient();
    this.shrFhirClient = new ShrFhirClient(locationUuid);
    this.hapiFhirClient = new HapiFhirClient(locationUuid);
    this.mappingService = new HieMappingService();

    this.transformer = new FhirTransformer(this.mappingService);
  }

  async fetchSHR(cr_id: string): Promise<any> {
    try {
      const response = await this.httpClient.get<EncodedFhirResponse>(
        config.HIE.SHR_FETCH_URL + "?cr_id=" + cr_id
      );

      if (!response.data?.data) {
        throw new Error("Patient not found in HIE registry");
      }

      const shrData = decryptData(response.data.data);

      // Transform searchset to collection bundle
      const collectionBundle = this.transformToCollectionBundle(shrData);

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

    logger.debug(
      `Transforming searchset bundle with ${searchsetBundle.entry.length} entries to collection bundle`
    );

    // For collection bundle, we keep the original structure but clean up entries
    const validEntries = searchsetBundle.entry.filter((entry: any) => {
      const resource = entry.resource;
      if (
        !resource?.resourceType ||
        !this.isValidFhirResourceType(resource.resourceType)
      ) {
        logger.debug(
          `Skipping invalid resource type: ${resource?.resourceType}`
        );
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
      let resourceKey = "";
      if (
        resource.identifier &&
        Array.isArray(resource.identifier) &&
        resource.identifier.length > 0
      ) {
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
        resource: resource,
      };

      // Add request information if it exists, otherwise use search as fallback
      if (entry.request) {
        collectionEntry.request = entry.request;
      } else if (entry.search) {
        collectionEntry.request = {
          method: "POST",
          url: resource.resourceType,
        };
      }

      uniqueEntries.set(resourceKey || fullUrl, collectionEntry);
    });

    // Create collection bundle
    const collectionBundle = {
      resourceType: "Bundle",
      type: "collection",
      timestamp: new Date().toISOString(),
      entry: Array.from(uniqueEntries.values()),
    };

    logger.debug(
      `Created collection bundle with ${collectionBundle.entry.length} unique entries`
    );

    return collectionBundle;
  }

  private isValidFhirResourceType(resourceType: string): boolean {
    const validResourceTypes = [
      "Patient",
      "Practitioner",
      "Organization",
      "Location",
      "HealthcareService",
      "Encounter",
      "Condition",
      "Procedure",
      "Observation",
      "DiagnosticReport",
      "ServiceRequest",
      "MedicationRequest",
      "MedicationDispense",
      "MedicationStatement",
      "AllergyIntolerance",
      "CarePlan",
      "Goal",
      "Immunization",
      "Coverage",
      "Claim",
      "Composition",
      "DocumentReference",
      "Binary",
      "Bundle",
      "EpisodeOfCare",
      "Device",
      "Specimen",
      "Media",
      "Group",
    ];

    return validResourceTypes.includes(resourceType);
  }

  async postBundleToOpenHIM(bundle: any): Promise<any> {
    try {
      const openHimUrl = `${config.HIE.OPENHIM_BASE_URL}${config.HIE.OPENHIM_FHIR_ENDPOINT}`;

      logger.debug(
        `Posting transaction bundle to OpenHIM FHIR endpoint: ${openHimUrl}`
      );

      // Use fetch for OpenHIM with custom headers
      const authHeaders = {
        Authorization: `Basic ${Buffer.from(
          `${config.HIE.OPENHIM_USERNAME}:${config.HIE.OPENHIM_PASSWORD}`
        ).toString("base64")}`,
        "Content-Type": "application/fhir+json",
        Accept: "application/fhir+json",
      };

      const response = await fetch(openHimUrl, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(bundle),
      });

      logger.debug(
        `Successfully posted bundle to OpenHIM. Response status: ${response.status}`
      );

      return await response.json();
    } catch (error: any) {
      logger.error(`Failed to post bundle to OpenHIM: ${error.message}`);
      const details =
        error.response?.data?.issue?.[0]?.diagnostics ||
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
      logger.error(`HIE client registry request failed: ${error.message}`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: config.HIE.SHR_POST_BUNDLE_URL,
        bundleId: bundle.id,
      });
      throw new Error(error.response?.data || error.message);
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

  async postBundleToExternalHapi(bundle: FhirBundle<any>): Promise<any> {
    try {
      // Use ShrFhirClient which is already configured for OpenHIM
      const response = await this.shrFhirClient.postBundle(bundle);

      logger.info(`[EXTERNAL SHR] ✓ Bundle posted to OpenHIM successfully`, {
        bundleId: (bundle as any).id,
        route: config.HIE.OPENHIM_FHIR_ENDPOINT,
      });
      return response;
    } catch (error: any) {
      const errorDetails = {
        bundleId: (bundle as any).id,
        baseUrl: config.HIE.OPENHIM_BASE_URL,
        path: config.HIE.OPENHIM_FHIR_ENDPOINT,
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: JSON.stringify(error.response?.data),
        errorMessage: error.message,
        errorCode: error.code,
      };

      logger.error(
        `[EXTERNAL SHR] ✗ Failed to post bundle to OpenHIM`,
        errorDetails
      );
      throw error;
    }
  }

  async postBundleToShrHieWithToken(bundle: FhirBundle<any>): Promise<any> {
    try {
      const fullUrl = `${this.openHIM.getBaseURL()}${
        config.HIE.SHR_POST_BUNDLE_URL
      }`;
      logger.info(
        `[HIE SHR] Attempting to post bundle to /shr/hie with HIE token`,
        {
          fullUrl,
          baseUrl: this.openHIM.getBaseURL(),
          path: config.HIE.SHR_POST_BUNDLE_URL,
          bundleId: (bundle as any).id,
          bundleType: bundle.resourceType,
          entryCount: bundle.entry?.length || 0,
        }
      );

      // Use HIE HTTP client which handles token authentication
      const response = await this.openHIM.post<any>(
        config.HIE.SHR_POST_BUNDLE_URL,
        bundle
      );

      logger.info(`[HIE SHR] ✓ Bundle posted to /shr/hie successfully`, {
        bundleId: (bundle as any).id,
        status: response.status,
        fullUrl,
      });
      return response.data;
    } catch (error: any) {
      const errorDetails = {
        bundleId: (bundle as any).id,
        fullUrl: `${this.httpClient.getBaseURL()}${
          config.HIE.SHR_POST_BUNDLE_URL
        }`,
        baseUrl: this.httpClient.getBaseURL(),
        path: config.HIE.SHR_POST_BUNDLE_URL,
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: JSON.stringify(error.response?.data),
        errorMessage: error.message,
        errorCode: error.code,
      };

      logger.error(
        `[HIE SHR] ✗ Failed to post bundle to /shr/hie`,
        errorDetails
      );
      throw new Error(`Failed to post bundle to HIE SHR: ${error.message}`);
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
      return shrBundle;

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
