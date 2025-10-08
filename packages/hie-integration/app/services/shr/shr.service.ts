import config from "../../config/env";
import { FhirBundle, EncryptedClientResp } from "../../types/hie.type";
import { logger } from "../../utils/logger";
import { HieHttpClient } from "../../utils/http-client";
import { VisitService } from "../amrs/visit-service";
import { AmrsFhirClient } from "./amrs-fhir-client";
import { ShrFhirClient } from "./shr-fhir-client";
import { FhirTransformer } from "./fhir-transformer";
import { IdMappings } from "./types";
import axios from "axios";

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

      // Transform searchset to transaction bundle with internal references
      const transactionBundle = this.transformToTransactionBundle(response.data);
      
      // Post the transaction bundle to OpenHIM before returning
      try {
        console.log(`Posting transformed bundle for patient ${cr_id} to OpenHIM`);
        await this.postBundleToOpenHIM(transactionBundle);
        console.log(`Successfully posted bundle for patient ${cr_id} to OpenHIM`);
      } catch (openHimError: any) {
        console.error(`Failed to post bundle to OpenHIM for patient ${cr_id}: ${openHimError.message}`);
        // Continue execution - don't fail the entire operation if OpenHIM post fails
        // The transaction bundle will still be returned for other uses
      }
      
      return transactionBundle;
    } catch (error: any) {
      console.error(`HIE client registry request failed: ${error.message}`);
      const details =
        error.response?.data?.issue?.[0]?.diagnostics ||
        JSON.stringify(error.response?.data) ||
        error.message;

      throw new Error(`Failed to fetch patient: ${details}`);
    }
  }

  private transformToTransactionBundle(searchsetBundle: any): any {
    if (!searchsetBundle.entry || searchsetBundle.entry.length === 0) {
      return searchsetBundle;
    }

    console.log(`Transforming searchset bundle with ${searchsetBundle.entry.length} entries to transaction bundle`);

    // First, add missing reference stubs to ensure all references can be resolved
    const bundleWithStubs = this.addMissingReferenceStubs(searchsetBundle);
    
    // Reorder resources by dependency hierarchy
    const reorderedBundle = this.reorderBundleResources(bundleWithStubs);

    // Create mapping from original resource references to new urn:uuid references
    const resourceUuidMap = new Map<string, string>();
    const uuidCounter = new Map<string, number>();
    const processedIdentifiers = new Set<string>(); // Track processed resources to avoid duplicates

    // Generate UUIDs for all valid resources only
    reorderedBundle.entry.forEach((entry: any) => {
      const resource = entry.resource;
      if (!resource?.resourceType || !this.isValidFhirResourceType(resource.resourceType)) {
        console.warn(`Skipping invalid resource type: ${resource?.resourceType}`);
        return;
      }

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
        console.debug(`Skipping duplicate resource: ${resourceKey}`);
        return;
      }
      
      if (resourceKey) {
        processedIdentifiers.add(resourceKey);
      }
      
      const fullReference = originalId ? `${resourceType}/${originalId}` : '';
      
      // Generate a meaningful UUID that retains identifier reference
      let newUuid = '';
      
      // Try to use primary identifier for UUID generation
      if (resource.identifier && Array.isArray(resource.identifier) && resource.identifier.length > 0) {
        const primaryIdentifier = resource.identifier[0];
        if (primaryIdentifier.value) {
          // Create UUID based on identifier value for traceability
          const identifierValue = primaryIdentifier.value.replace(/[^a-zA-Z0-9-]/g, '-');
          newUuid = `urn:uuid:${resourceType.toLowerCase()}-${identifierValue}`;
        }
      }
      
      // Fallback to semantic numbering if no identifier
      if (!newUuid) {
        if (originalId) {
          newUuid = `urn:uuid:${resourceType.toLowerCase()}-${originalId}`;
        } else {
          const typeCount = (uuidCounter.get(resourceType) || 0) + 1;
          uuidCounter.set(resourceType, typeCount);
          newUuid = `urn:uuid:${resourceType.toLowerCase()}-${typeCount}`;
        }
      }
      
      // Map all possible reference formats
      if (fullReference) {
        resourceUuidMap.set(fullReference, newUuid);
      }
      if (originalId) {
        resourceUuidMap.set(originalId, newUuid);
      }
      
      // Also map any external URL references
      if (entry.fullUrl && entry.fullUrl.startsWith('http')) {
        resourceUuidMap.set(entry.fullUrl, newUuid);
      }
      
      // Map identifier-based references if they exist
      if (resource.identifier && Array.isArray(resource.identifier)) {
        resource.identifier.forEach((identifier: any) => {
          if (identifier.system && identifier.value) {
            const identifierKey = `${identifier.system}|${identifier.value}`;
            resourceUuidMap.set(identifierKey, newUuid);
            
            // Also map common identifier reference patterns
            resourceUuidMap.set(`${resourceType}?identifier=${identifierKey}`, newUuid);
            resourceUuidMap.set(`${resourceType}?identifier=${identifier.value}`, newUuid);
          }
        });
      }
      
      console.debug(`Generated UUID for ${fullReference || resourceKey} → ${newUuid}`);
    });

    // Transform entries to transaction format - only process valid FHIR resources
    const transactionEntries = reorderedBundle.entry.map((entry: any) => {
      const resource = entry.resource;
      const resourceType = resource?.resourceType;
      const originalId = resource?.id;
      
      if (!resourceType || !this.isValidFhirResourceType(resourceType)) {
        console.warn(`Skipping entry with invalid resourceType: ${resourceType}`);
        return null;
      }

      // Skip duplicate resources based on identifier
      let resourceKey = '';
      if (resource.identifier && Array.isArray(resource.identifier) && resource.identifier.length > 0) {
        const primaryIdentifier = resource.identifier[0];
        if (primaryIdentifier.system && primaryIdentifier.value) {
          resourceKey = `${resourceType}|${primaryIdentifier.system}|${primaryIdentifier.value}`;
        }
      }
      
      if (!resourceKey && originalId) {
        resourceKey = `${resourceType}/${originalId}`;
      }

      // Get the new UUID for this resource
      const fullReference = originalId ? `${resourceType}/${originalId}` : resourceKey;
      const newUuid = resourceUuidMap.get(fullReference) || resourceUuidMap.get(originalId || '') || resourceUuidMap.get(resourceKey);
      
      if (!newUuid) {
        console.warn(`No UUID mapping found for ${fullReference || resourceKey}`);
        return null;
      }

      // Clone the resource and update internal references
      const updatedResource = this.updateInternalReferences(
        JSON.parse(JSON.stringify(resource)),
        resourceUuidMap
      );

      // Remove the original ID since we're using UUIDs now
      delete updatedResource.id;

      return {
        fullUrl: newUuid,
        resource: updatedResource,
        request: {
          method: "POST",
          url: resourceType
        }
      };
    }).filter((entry: any) => entry !== null);

    // Remove duplicates based on fullUrl
    const uniqueEntries = new Map();
    transactionEntries.forEach((entry: any) => {
      if (!uniqueEntries.has(entry.fullUrl)) {
        uniqueEntries.set(entry.fullUrl, entry);
      } else {
        console.debug(`Removed duplicate entry with fullUrl: ${entry.fullUrl}`);
      }
    });

    // Create transaction bundle
    const transactionBundle = {
      resourceType: "Bundle",
      type: "transaction",
      timestamp: new Date().toISOString(),
      entry: Array.from(uniqueEntries.values())
    };

    console.log(`Created transaction bundle with ${transactionBundle.entry.length} unique entries`);
    
    return transactionBundle;
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

  private updateInternalReferences(resource: any, uuidMap: Map<string, string>): any {
    if (!resource || typeof resource !== 'object') {
      return resource;
    }

    if (Array.isArray(resource)) {
      return resource.map(item => this.updateInternalReferences(item, uuidMap));
    }

    // Check for reference fields
    if (resource.reference && typeof resource.reference === 'string') {
      const originalRef = resource.reference;
      
      // Try to find a UUID mapping for this reference
      let newUuid = null;
      
      // Try different reference patterns in order of preference
      const referencesToTry = [
        originalRef, // Exact match first
        originalRef.replace(/^https?:\/\/[^\/]+\/fhir\//, ''), // Remove base URL
        originalRef.split('/').slice(-2).join('/'), // ResourceType/ID
        originalRef.split('/').pop(), // Just the ID
      ];
      
      // Also try identifier-based matching if we have identifier info
      if (resource.identifier && resource.identifier.system && resource.identifier.value) {
        const identifierKey = `${resource.identifier.system}|${resource.identifier.value}`;
        referencesToTry.unshift(identifierKey);
        
        // Try conditional reference patterns
        const resourceType = originalRef.split('/')[0];
        referencesToTry.unshift(`${resourceType}?identifier=${identifierKey}`);
        referencesToTry.unshift(`${resourceType}?identifier=${resource.identifier.value}`);
      }
      
      for (const refPattern of referencesToTry) {
        if (refPattern && uuidMap.has(refPattern)) {
          newUuid = uuidMap.get(refPattern);
          break;
        }
      }
      
      if (newUuid) {
        console.debug(`Updated reference: ${originalRef} → ${newUuid}`);
        return {
          ...resource,
          reference: newUuid
        };
      } else {
        console.debug(`No UUID mapping found for reference: ${originalRef}`);
        return resource;
      }
    }

    // Recursively process all properties
    const updatedResource: any = {};
    Object.entries(resource).forEach(([key, value]) => {
      updatedResource[key] = this.updateInternalReferences(value, uuidMap);
    });

    return updatedResource;
  }

  private reorderBundleResources(bundle: any): any {
    if (!bundle.entry || bundle.entry.length === 0) {
      return bundle;
    }

    console.debug(`Reordering ${bundle.entry.length} resources by dependency hierarchy`);

    // First, extract missing references and create stub resources
    const bundleWithStubs = this.addMissingReferenceStubs(bundle);

    // Define resource type priority order (lower number = higher priority)
    const resourcePriority = new Map<string, number>([
      // Foundation resources (most referenced)
      ['Patient', 1],
      ['Practitioner', 2], 
      ['Organization', 3],
      ['Location', 4],
      
      // Administrative resources
      ['Encounter', 5],
      ['EpisodeOfCare', 6],
      
      // Clinical resources that reference the above
      ['Condition', 7],
      ['Procedure', 8],
      ['ServiceRequest', 9],
      ['DiagnosticReport', 10],
      ['Observation', 11],
      ['MedicationRequest', 12],
      ['MedicationDispense', 13],
      ['MedicationStatement', 14],
      ['AllergyIntolerance', 15],
      ['CarePlan', 16],
      ['Goal', 17],
      
      // Document resources
      ['Composition', 18],
      ['DocumentReference', 19],
      
      // Financial resources
      ['Coverage', 20],
      ['Claim', 21],
      
      // Other/Unknown resources (lowest priority)
      ['Unknown', 99]
    ]);

    // Group resources by type
    const resourceGroups = new Map<string, any[]>();
    
    bundleWithStubs.entry.forEach((entry: any) => {
      const resourceType = entry.resource?.resourceType || 'Unknown';
      
      if (!resourceGroups.has(resourceType)) {
        resourceGroups.set(resourceType, []);
      }
      resourceGroups.get(resourceType)!.push(entry);
    });

    // Sort resource groups by priority and then sort within each group
    const sortedEntries: any[] = [];
    
    // Get all resource types sorted by priority
    const sortedResourceTypes = Array.from(resourceGroups.keys()).sort((a, b) => {
      const priorityA = resourcePriority.get(a) || 99;
      const priorityB = resourcePriority.get(b) || 99;
      return priorityA - priorityB;
    });

    // Add resources in priority order
    sortedResourceTypes.forEach(resourceType => {
      const entries = resourceGroups.get(resourceType)!;
      
      // Within each resource type, sort by ID for consistency
      entries.sort((a, b) => {
        const idA = a.resource?.id || '';
        const idB = b.resource?.id || '';
        return idA.localeCompare(idB);
      });
      
      sortedEntries.push(...entries);
      
      console.debug(`Added ${entries.length} ${resourceType} resources to reordered bundle`);
    });

    // Create new bundle with reordered entries
    const reorderedBundle = {
      ...bundleWithStubs,
      entry: sortedEntries
    };

    console.debug(`Successfully reordered bundle: ${bundle.entry.length} → ${reorderedBundle.entry.length} resources`);
    
    return reorderedBundle;
  }

  private addMissingReferenceStubs(bundle: any): any {
    if (!bundle.entry || bundle.entry.length === 0) {
      return bundle;
    }

    console.debug(`Analyzing bundle for missing references...`);

    // Create a set of all existing resource references in the bundle
    const existingResources = new Set<string>();
    const existingIdentifiers = new Map<string, any>(); // Map identifier system|value to entry
    
    bundle.entry.forEach((entry: any) => {
      const resource = entry.resource;
      if (resource?.resourceType && resource?.id) {
        const fullReference = `${resource.resourceType}/${resource.id}`;
        existingResources.add(fullReference);
        existingResources.add(resource.id);
        
        // Also track by identifiers
        if (resource.identifier && Array.isArray(resource.identifier)) {
          resource.identifier.forEach((identifier: any) => {
            if (identifier.system && identifier.value) {
              const identifierKey = `${identifier.system}|${identifier.value}`;
              existingIdentifiers.set(identifierKey, entry);
            }
          });
        }
      }
    });

    // Find all references in the bundle
    const missingReferences = new Set<string>();
    const referencesToStub = new Map<string, any>(); // Map reference to stub info
    
    const findReferences = (obj: any, path: string = '') => {
      if (!obj || typeof obj !== 'object') return;
      
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => findReferences(item, `${path}[${index}]`));
        return;
      }
      
      // Check for reference fields
      if (obj.reference && typeof obj.reference === 'string') {
        const reference = obj.reference;
        
        // Skip internal references (starting with #)
        if (reference.startsWith('#')) return;
        
        // Check if this reference exists in our bundle
        const referenceId = reference.split('/').pop();
        if (!existingResources.has(reference) && !existingResources.has(referenceId || '')) {
          missingReferences.add(reference);
          
          // Extract information for creating stub - only for valid FHIR resource types
          let resourceType = '';
          let resourceId = '';
          
          // Try to extract resource type from the reference
          if (reference.includes('/')) {
            const parts = reference.split('/');
            // For URLs like "https://domain/fhir/ResourceType/id", get ResourceType
            const potentialResourceType = parts[parts.length - 2];
            const potentialId = parts[parts.length - 1];
            
            if (this.isValidFhirResourceType(potentialResourceType)) {
              resourceType = potentialResourceType;
              resourceId = potentialId;
            }
          }
          
          // If we couldn't extract a valid resource type, try to infer from HIE patterns
          if (!resourceType) {
            if (reference.includes('Patient') || reference.includes('cr.kenya-hie.health')) {
              resourceType = 'Patient';
              resourceId = referenceId || reference.split('/').pop() || 'unknown';
            } else if (reference.includes('Practitioner') || reference.includes('hwr.kenya-hie.health')) {
              resourceType = 'Practitioner';
              resourceId = referenceId || reference.split('/').pop() || 'unknown';
            } else if (reference.includes('Organization') || reference.includes('fr.kenya-hie.health') || reference.includes('kmhfl.health.go.ke')) {
              resourceType = 'Organization';
              resourceId = referenceId || reference.split('/').pop() || 'unknown';
            }
          }
          
          if (resourceType && resourceId && this.isValidFhirResourceType(resourceType)) {
            referencesToStub.set(reference, {
              resourceType,
              resourceId,
              originalReference: reference,
              identifier: obj.identifier || null,
              display: obj.display || null
            });
          } else {
            console.debug(`Skipping stub creation for invalid reference: ${reference}`);
          }
        }
      }
      
      // Recursively process all properties
      Object.values(obj).forEach(value => findReferences(value, path));
    };

    // Analyze all resources for references
    bundle.entry.forEach((entry: any) => {
      findReferences(entry.resource);
    });

    console.debug(`Found ${missingReferences.size} missing references`);

    // Create stub resources for missing references
    const stubEntries: any[] = [];
    
    referencesToStub.forEach((stubInfo, reference) => {
      const { resourceType, resourceId, identifier, display } = stubInfo;
      
      // Only create stubs for valid FHIR resource types
      if (!this.isValidFhirResourceType(resourceType)) {
        console.warn(`Skipping stub creation for invalid resource type: ${resourceType}`);
        return;
      }
      
      // Generate fullUrl based on identifier or resource type/id
      let fullUrl = '';
      let stubResource: any = {
        resourceType,
        id: resourceId
      };
      
      // Try to create meaningful identifier and fullUrl
      if (identifier && identifier.system && identifier.value) {
        fullUrl = `${identifier.system}/${identifier.value}`;
        stubResource.identifier = [identifier];
      } else {
        // Check if we can extract identifier info from common HIE patterns
        const hieIdentifier = this.extractHIEIdentifier(reference, resourceType);
        if (hieIdentifier) {
          fullUrl = `${hieIdentifier.system}/${hieIdentifier.value}`;
          stubResource.identifier = [hieIdentifier];
        } else {
          // Fallback to urn:uuid
          fullUrl = `urn:uuid:stub-${resourceType}-${resourceId}`;
        }
      }
      
      // Add display name if available
      if (display) {
        if (resourceType === 'Patient') {
          stubResource.name = [{ text: display }];
        } else if (resourceType === 'Practitioner') {
          stubResource.name = [{ text: display }];
        } else if (resourceType === 'Organization') {
          stubResource.name = display;
        }
      }
      
      // Add minimal required fields based on resource type
      stubResource = this.addMinimalResourceFields(stubResource, resourceType);
      
      const stubEntry = {
        fullUrl,
        resource: stubResource,
        search: {
          mode: "include"
        }
      };
      
      stubEntries.push(stubEntry);
      
      console.debug(`Created stub for ${resourceType}/${resourceId} with fullUrl: ${fullUrl}`);
    });

    if (stubEntries.length > 0) {
      console.log(`Added ${stubEntries.length} stub resources for missing references`);
      
      return {
        ...bundle,
        entry: [...bundle.entry, ...stubEntries]
      };
    }
    
    return bundle;
  }

  private extractHIEIdentifier(reference: string, resourceType: string): any | null {
    // Extract HIE-specific identifier patterns from URLs
    const hiePatterns = {
      Patient: [
        /cr\.kenya-hie\.health\/api\/v4\/Patient\/(.+)/,
        /dhpstagingapi\.health\.go\.ke.*\/(.+)/,
        /api\.dha\.go\.ke.*\/(.+)/
      ],
      Practitioner: [
        /hwr\.kenya-hie\.health\/api\/v4\/Practitioner\/(.+)/
      ],
      Organization: [
        /fr\.kenya-hie\.health\/api\/v4\/Organization\/(.+)/,
        /api\.kmhfl\.health\.go\.ke.*\/(.+)/
      ]
    };
    
    const patterns = hiePatterns[resourceType as keyof typeof hiePatterns];
    if (!patterns) return null;
    
    for (const pattern of patterns) {
      const match = reference.match(pattern);
      if (match) {
        const value = match[1];
        let system = '';
        
        if (reference.includes('cr.kenya-hie.health')) {
          system = 'https://cr.kenya-hie.health/api/v4/Patient';
        } else if (reference.includes('hwr.kenya-hie.health')) {
          system = 'https://hwr.kenya-hie.health/api/v4/Practitioner';
        } else if (reference.includes('fr.kenya-hie.health')) {
          system = 'https://fr.kenya-hie.health/api/v4/Organization';
        } else if (reference.includes('kmhfl.health.go.ke')) {
          system = 'https://api.kmhfl.health.go.ke/api/facilities/facilities';
        }
        
        if (system) {
          return {
            use: 'official',
            system,
            value
          };
        }
      }
    }
    
    return null;
  }

  private addMinimalResourceFields(resource: any, resourceType: string): any {
    switch (resourceType) {
      case 'Patient':
        return {
          ...resource,
          active: true,
          gender: 'unknown'
        };
      
      case 'Practitioner':
        return {
          ...resource,
          active: true
        };
      
      case 'Organization':
        return {
          ...resource,
          active: true
        };
      
      case 'Encounter':
        return {
          ...resource,
          status: 'unknown',
          class: {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
            code: 'UNK',
            display: 'unknown'
          }
        };
      
      case 'Location':
        return {
          ...resource,
          status: 'active'
        };
        
      default:
        return resource;
    }
  }

  async postBundleToOpenHIM(bundle: any): Promise<any> {
    try {
      const openHimUrl = `${config.HIE.OPENHIM_BASE_URL}${config.HIE.OPENHIM_FHIR_ENDPOINT}`;
      
      console.log(`Posting transaction bundle to OpenHIM FHIR endpoint: ${openHimUrl}`);
      
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

      console.log(`Successfully posted bundle to OpenHIM. Response status: ${response.status}`);
      
      return await response.json();
    } catch (error: any) {
      console.error(`Failed to post bundle to OpenHIM: ${error.message}`);
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
