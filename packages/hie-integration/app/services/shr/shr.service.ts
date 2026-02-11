import axios from "axios";
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
import { decryptData } from "../../utils/decrypt-data";

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

  async fetchSHR(
    cr_id: string,
    location_uuid: string,
    options: {
      resources?: string;
      sort?: string;
      count?: number;
      _offset?: number;
    } = {}
  ): Promise<any> {
    try {
      const {
        resources = "Observation,MedicationRequest,Encounter,MedicationStatement,MedicationDispense,ServiceRequest",
        sort = "desc",
        count = 20,
        _offset = 0,
      } = options;

      const params = {
        cr_id,
        resources,
        sort,
        count,
        _offset,
      };

      const response = await this.httpClient.get<EncodedFhirResponse>(
        "/v1/international-patient-summary-by-resource",
        params
      );

      if (!response.data?.data) {
        throw new Error("Patient not found in HIE registry");
      }
      const facilityCode = await this.mappingService.getFacilityCodeUsingLocationUuid(
        location_uuid
      );
      const shrData = await decryptData(response.data.data, facilityCode ?? "");

      console.log(shrData);
      // Transform searchset to transaction bundle for HAPI FHIR compatibility
      const transactionBundle = this.transformToTransactionBundle(shrData, cr_id);

      return transactionBundle;
    } catch (error: any) {
      logger.error(`HIE client registry request failed: ${error.message}`);
      const details =
        error.response?.data?.issue?.[0]?.diagnostics ||
        JSON.stringify(error.response?.data) ||
        error.message;

      throw new Error(`Failed to fetch patient: ${details}`);
    }
  }

  private transformToTransactionBundle(
    searchsetBundle: any,
    patientId?: string
  ): any {
    if (!searchsetBundle.entry || searchsetBundle.entry.length === 0) {
      return {
        resourceType: "Bundle",
        type: "transaction",
        timestamp: new Date().toISOString(),
        entry: [],
      };
    }

    logger.debug(
      `Transforming searchset bundle with ${searchsetBundle.entry.length} entries to transaction bundle`
    );

    // Filter to valid FHIR resource types only
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

    // 1. Build ID Map (Old Reference -> New Reference)
    // We scan all valid entries to determine if their IDs need sanitization (e.g. numeric -> prefixed)
    const idMap = new Map<string, string>();

    validEntries.forEach((entry: any) => {
      const resource = entry.resource;
      const originalId = resource.id;
      const resourceType = resource.resourceType;

      if (originalId) {
        // Generate a safe, non-numeric ID if needed
        const newId = this.sanitizeId(originalId);

        // Map the old absolute/relative reference to the new one
        // Handle "ResourceType/ID" format
        idMap.set(`${resourceType}/${originalId}`, `${resourceType}/${newId}`);
        // Handle "urn:uuid:ID" format if present
        if (originalId.startsWith("urn:uuid:")) {
          idMap.set(originalId, `urn:uuid:${newId}`);
        }

        // Store the new ID on the resource for later
        entry._newId = newId;
      }
    });

    // 2. Process Entries: Rewrite references and build transaction
    const uniqueEntries = new Map<string, any>();
    const processedIdentifiers = new Set<string>();

    validEntries.forEach((entry: any) => {
      const resource = entry.resource;
      const resourceType = resource.resourceType;
      const originalId = resource.id;
      const newId = entry._newId || originalId; // Use the sanitized ID

      // A. Rewrite internal references using our map
      this.rewriteReferences(resource, idMap);

      // B. Update the resource ID itself
      resource.id = newId;

      // Create a unique key for this resource to avoid duplicates
      let resourceKey = "";
      let primaryIdentifier: { system: string; value: string } | null = null;

      if (
        resource.identifier &&
        Array.isArray(resource.identifier) &&
        resource.identifier.length > 0
      ) {
        const firstIdentifier = resource.identifier[0];
        if (firstIdentifier.system && firstIdentifier.value) {
          primaryIdentifier = firstIdentifier;
          resourceKey = `${resourceType}|${firstIdentifier.system}|${firstIdentifier.value}`;
        }
      }

      // If no identifier-based key, use resourceType/id
      if (!resourceKey && newId) {
        resourceKey = `${resourceType}/${newId}`;
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
      // If we changed the ID, we likely need to update the fullUrl too for consistency
      // But preserving the original fullUrl is sometimes important if internal references use it.
      // However, since we rewrote references based on ResourceType/ID, let's standardize fullUrl to that.
      if (!fullUrl || originalId) {
        fullUrl = `${resourceType}/${newId}`;
      }

      // Build request entry for HAPI FHIR transaction bundle
      const transactionEntry: any = {
        fullUrl: fullUrl,
        resource: resource,
        request: {} as any,
      };

      if (newId) {
        // Direct update by the new sanitized ID - Most specific and safe
        // This avoids ambiguous identifier matches (HAPI-0958) AND numeric ID issues (HAPI-0960)
        transactionEntry.request.method = "PUT";
        transactionEntry.request.url = `${resourceType}/${newId}`;
      } else if (primaryIdentifier) {
        // Fallback for resources without IDs (should be rare if source is valid FHIR)
        const identifierQuery = `identifier=${encodeURIComponent(
          primaryIdentifier.system
        )}|${encodeURIComponent(primaryIdentifier.value)}`;
        transactionEntry.request.method = "POST";
        transactionEntry.request.url = resourceType;
        transactionEntry.request.ifNoneExist = identifierQuery;
      } else {
        // Ultimate Fallback
        transactionEntry.request.method = "POST";
        transactionEntry.request.url = resourceType;
      }

      uniqueEntries.set(resourceKey || fullUrl, transactionEntry);
    });

    // Ensure Patient resource exists if referenced (HAPI-1094)
    if (patientId) {
      let hasPatient = false;
      for (const entry of uniqueEntries.values()) {
        if (entry.resource.resourceType === "Patient") {
          hasPatient = true;
          break;
        }
      }

      if (!hasPatient) {
        logger.debug(`Injecting missing Patient resource for ${patientId}`);
        const patientResource = {
          resourceType: "Patient",
          id: patientId,
          identifier: [
            {
              system: "http://kendata.org/identifier/cr-id",
              value: patientId,
            },
          ],
        };

        const entry = {
          fullUrl: `Patient/${patientId}`,
          resource: patientResource,
          request: {
            method: "PUT",
            url: `Patient/${patientId}`,
          },
        };
        uniqueEntries.set(`Patient/${patientId}`, entry);
      }
    }

    // Generic fix for other missing references (Encounter, Practitioner, Organization, MedicationRequest)
    this.injectMissingReferences(uniqueEntries, patientId);

    // Create transaction bundle
    const transactionBundle = {
      resourceType: "Bundle",
      type: "transaction",
      timestamp: new Date().toISOString(),
      entry: Array.from(uniqueEntries.values()),
    };

    logger.debug(
      `Created transaction bundle with ${transactionBundle.entry.length} unique entries`
    );

    return transactionBundle;
  }

  // Helper to scan for missing references and inject placeholders
  private injectMissingReferences(
    uniqueEntries: Map<string, any>,
    patientId?: string
  ) {
    const existingResources = new Set<string>();
    const missingReferences = new Set<string>();

    // 1. Catalog existing resources
    for (const entry of uniqueEntries.values()) {
      const resource = entry.resource;
      if (resource.resourceType && resource.id) {
        existingResources.add(`${resource.resourceType}/${resource.id}`);
      }
    }

    // 2. Scan for references
    const scanReferences = (obj: any) => {
      if (!obj || typeof obj !== "object") return;
      if (Array.isArray(obj)) {
        obj.forEach((item) => scanReferences(item));
        return;
      }
      if (obj.reference && typeof obj.reference === "string") {
        const ref = obj.reference;
        // Check if reference is relative ResourceType/ID format
        if (ref.match(/^[A-Z][a-zA-Z]+\/[A-Za-z0-9\-\.]+$/)) {
          if (!existingResources.has(ref)) {
            missingReferences.add(ref);
          }
        }
      }
      Object.keys(obj).forEach((key) => {
        if (key !== "reference" && key !== "resourceType" && key !== "id") {
          scanReferences(obj[key]);
        }
      });
    };

    for (const entry of uniqueEntries.values()) {
      scanReferences(entry.resource);
    }

    // 3. Create placeholders for missing references
    missingReferences.forEach((ref) => {
      const [resourceType, id] = ref.split("/");
      // Only inject for specific types we know are safe/required
      if (
        [
          "Encounter",
          "Practitioner",
          "Organization",
          "Location",
          "MedicationRequest",
        ].includes(resourceType)
      ) {
        // Double check not already added (e.g. by Patient logic or previous iteration)
        if (uniqueEntries.has(ref)) return;

        logger.debug(
          `Injecting placeholder for missing reference: ${resourceType}/${id}`
        );

        let resource: any = {
          resourceType: resourceType,
          id: id,
        };

        // Add minimal required fields for validity
        if (resourceType === "Encounter") {
          resource.status = "unknown";
          resource.class = {
            system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
            code: "AMB",
            display: "ambulatory",
          };
        } else if (resourceType === "MedicationRequest") {
          resource.status = "unknown";
          resource.intent = "order";
          resource.medicationCodeableConcept = { text: "Unknown Medication" };
          if (patientId) {
            resource.subject = { reference: `Patient/${patientId}` };
          }
        } else if (resourceType === "Practitioner") {
          resource.name = [{ family: "Unknown", given: ["Provider"] }];
        } else if (resourceType === "Organization") {
          resource.name = "Unknown Organization";
        } else if (resourceType === "Location") {
          resource.name = "Unknown Location";
        }

        const entry = {
          fullUrl: ref,
          resource: resource,
          request: {
            method: "PUT",
            url: ref,
          },
        };
        uniqueEntries.set(ref, entry);
        // Add to existing set to prevent duplicates if referenced multiple times
        existingResources.add(ref);
      }
    });
  }

  // Helper to ensure IDs are valid for creation (non-numeric)
  private sanitizeId(id: string): string {
    // If ID is purely numeric, prefix it to make it alphanumeric
    // HAPI FHIR default policy rejects purely numeric IDs for client-assigned creation
    if (/^\d+$/.test(id)) {
      return `shr-${id}`;
    }
    return id;
  }

  // Helper to recursively rewrite references in a resource
  private rewriteReferences(obj: any, idMap: Map<string, string>) {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    if (Array.isArray(obj)) {
      obj.forEach(item => this.rewriteReferences(item, idMap));
      return;
    }

    // Check if this object is a Reference
    // A FHIR Reference has a 'reference' string property
    if (obj.reference && typeof obj.reference === 'string') {
      const ref = obj.reference;
      // Check if this reference points to something we've remapped
      // The map keys are mostly relative references like "Patient/123"

      // Try exact match
      if (idMap.has(ref)) {
        obj.reference = idMap.get(ref);
      } else {
        // If reference is absolute URL that ends with a mapped key, we might want to update it
        // but generally local references are relative. 
        // Let's check if the reference *contains* a mapped key as a suffix
        for (const [oldRef, newRef] of idMap.entries()) {
          if (ref.endsWith(oldRef) && (ref === oldRef || ref.endsWith('/' + oldRef))) {
            // Replace the suffix
            obj.reference = ref.slice(0, ref.length - oldRef.length) + newRef;
            break;
          }
        }
      }
    }

    // Recurse into all properties
    Object.keys(obj).forEach(key => {
      this.rewriteReferences(obj[key], idMap);
    });
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

      const response = await axios.post(openHimUrl, bundle, {
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${config.HIE.OPENHIM_USERNAME}:${config.HIE.OPENHIM_PASSWORD}`
          ).toString("base64")}`,
          "Content-Type": "application/fhir+json",
          Accept: "application/fhir+json",
        },
        timeout: 10000,
      });

      logger.debug(
        `Successfully posted bundle to OpenHIM. Response status: ${response.status}`
      );

      return response.data;
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
      const fullUrl = `${this.openHIM.getBaseURL()}${config.HIE.SHR_POST_BUNDLE_URL
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
        fullUrl: `${this.httpClient.getBaseURL()}${config.HIE.SHR_POST_BUNDLE_URL
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
