import Joi from "joi";
import { ServerRoute } from "@hapi/hapi";
import { ClientRegistryService } from "../services/client-registry/client-registry.service";
import { FacilityRegistryService } from "../services/facility-registry/facility-registry.service";
import { logger } from "../utils/logger";
import {
  FhirBundle,
  IdentifierType,
  PatientSearchPayload,
  FacilityFilterDto,
} from "../types/hie.type";
import { PractitionerRegistryService } from "../services/practitioner-registry/practitioner-registry.service";
import { AmrsProviderService } from "../services/amrs/amrs-provider.service";
import { SHRService } from "../services/shr/shr.service";
import {
  KafkaConsumerService,
  kafkaConsumerService,
} from "../services/kafka/kafka-consumer.service";
import { HieMappingService } from "../services/amrs/hie-mapping-service";
import { MediatorUtils } from "../utils/mediator";
import config from "../config/env";

export const routes = (): ServerRoute[] => [
  {
    method: "POST",
    path: "/hie/client/search",
    options: {
      validate: {
        payload: Joi.object({
          identificationNumber: Joi.required().description(
            "Identification number"
          ),
          identificationType: Joi.string()
            .required()
            .valid(...Object.values(IdentifierType))
            .description("Identification Type"),
          locationUuid: Joi.string()
            .uuid()
            .required()
            .description("Location UUID"),
        }),
      },
      tags: ["api", "hie", "client-registry"],
      description: "Sync patient data from HIE client registry",
      notes:
        "Fetches patient data from national registry, compares with AMRS, and updates if necessary",
    },
    handler: async (request, h) => {
      const {
        identificationNumber,
        identificationType,
        locationUuid,
      } = request.payload as PatientSearchPayload;
      const service = new ClientRegistryService(locationUuid);

      try {
        const result = await service.fetchPatientFromHie(
          identificationNumber,
          identificationType,
          locationUuid
        );
        return h.response(result).code(200);
      } catch (error: any) {
        logger.error(
          `Patient sync failed: ${identificationNumber} - ${error.message}`
        );
        return h
          .response({
            error: "Patient search failed",
            details: error.message,
          })
          .code(400);
      }
    },
  },
  {
    method: "POST",
    path: "/hie/client/validate-custom-otp",
    options: {
      validate: {
        payload: Joi.object({
          sessionId: Joi.string().required(),
          otp: Joi.string().required(),
          locationUuid: Joi.string().required(),
        }),
      },
      tags: ["api", "hie", "client-registry", "otp"],
      description: "Validate OTP and search for patient",
    },
    handler: async (request, h) => {
      const { sessionId, otp, locationUuid } = request.payload as {
        sessionId: string;
        otp: string;
        locationUuid: string;
      };

      const service = new ClientRegistryService(locationUuid);

      try {
        const result = await service.validateOtp(sessionId, otp, locationUuid);

        return h
          .response({
            data: {
              identification_type: result.identificationType,
              identification_number: result.identificationNumber,
              status: result.status,
            },
          })
          .code(200);
      } catch (error: any) {
        logger.error(`OTP validation failed: ${error.message}`);
        return h
          .response({
            error: "OTP validation failed",
            details: error.message,
          })
          .code(400);
      }
    },
  },
  {
    method: "POST",
    path: "/hie/client/send-custom-otp",
    options: {
      validate: {
        payload: Joi.object({
          identificationNumber: Joi.string().required(),
          identificationType: Joi.string()
            .valid(...Object.values(IdentifierType))
            .default("National ID"),
          locationUuid: Joi.string().required(),
        }),
      },
      tags: ["api", "hie", "client-registry", "otp"],
      description: "Send OTP to patient's phone number",
    },
    handler: async (request, h) => {
      const {
        identificationNumber,
        identificationType,
        locationUuid,
      } = request.payload as PatientSearchPayload;

      const service = new ClientRegistryService(locationUuid);

      try {
        const result = await service.sendOtp(
          identificationNumber,
          identificationType
        );

        return h
          .response({
            message: "OTP sent successfully",
            sessionId: result.sessionId,
            maskedPhone: result.maskedPhone,
          })
          .code(200);
      } catch (error: any) {
        logger.error(`OTP sending failed: ${error.message}`);
        return h
          .response({
            error: "OTP sending failed",
            details: error.message,
          })
          .code(400);
      }
    },
  },
  {
    method: "GET",
    path: "/hie/practitioner/search",
    options: {
      validate: {
        query: Joi.object({
          identifierValue: Joi.string()
            .required()
            .description(
              "Identifier value (e.g. National ID, Passport number)"
            ),
          identifierType: Joi.string()
            .required()
            .valid(...Object.values(IdentifierType))
            .default(IdentifierType.NATIONAL_ID)
            .description("Type of identifier"),
          refresh: Joi.boolean()
            .default(false)
            .description("Force synchronization with HIE registry"),
          locationUuid: Joi.string()
            .uuid()
            .required()
            .description("Location UUID"),
        }),
      },
      tags: ["api", "hie", "practitioner-registry"],
      description: "Search for health practitioner in Practitioner Registry",
      notes:
        "Searches the national practitioner registry by ID, with local storage",
    },
    handler: async (request, h) => {
      const {
        identifierValue,
        identifierType,
        refresh,
        locationUuid,
      } = request.query as {
        identifierValue: string;
        identifierType: IdentifierType;
        refresh: boolean;
        locationUuid: string;
      };

      const service = new PractitionerRegistryService(locationUuid);

      try {
        const result = await service.getPractitioner(
          { type: identifierType, value: identifierValue },
          { refresh }
        );

        return h.response(result).code(200);
      } catch (error: any) {
        logger.error(
          `Practitioner search failed: ${identifierValue} - ${error.message}`
        );

        return h
          .response({
            error: "Practitioner search failed",
            details: error.message,
          })
          .code(400);
      }
    },
  },
  {
    method: "GET",
    path: "/hie/amrs/providers/active",
    options: {
      tags: ["api", "amrs", "providers"],
      description: "Get active providers from AMRS database",
      notes:
        "Returns providers who have been active in the last 12 months at the specified location",
      validate: {
        query: Joi.object({
          locationUuid: Joi.string()
            .uuid()
            .required()
            .description("UUID of the location to filter providers by"),
        }),
      },
    },
    handler: async (request, h) => {
      const { locationUuid } = request.query;
      const service = new AmrsProviderService();

      try {
        const result = await service.getActiveProviders(locationUuid);

        return h.response(result).code(200);
      } catch (error: any) {
        logger.error(`AMRS providers fetch failed: ${error.message}`);
        return h
          .response({
            error: "Failed to fetch providers from AMRS",
            details: error.message,
          })
          .code(500);
      }
    },
  },
  {
    method: "GET",
    path: "/hie/amrs/provider/national-id",
    options: {
      tags: ["api", "amrs", "provider"],
      description: "Get provider by national ID from AMRS database",
      notes:
        "Returns provider matching the provided national ID (partial or full match)",
      validate: {
        query: Joi.object({
          nationalId: Joi.string()
            .required()
            .description(
              "National ID to search for (supports partial matching)"
            ),
        }),
      },
    },
    handler: async (request, h) => {
      const { nationalId } = request.query;
      const service = new AmrsProviderService();

      try {
        const result = await service.getProviderByNationalId(nationalId);

        return h.response(result).code(200);
      } catch (error: any) {
        logger.error(
          `AMRS providers fetch by national ID failed: ${error.message}`
        );
        return h
          .response({
            error: "Failed to fetch providers by national ID from AMRS",
            details: error.message,
          })
          .code(500);
      }
    },
  },
  {
    method: "GET",
    path: "/hie/facility/search",
    options: {
      validate: {
        query: Joi.object({
          filterType: Joi.string()
            .required()
            .description("Filter type e.g facilityCode,registrationNumber"),
          filterValue: Joi.string()
            .required()
            .description(
              "Facility code e.g 24749 of registration number e.g GK-016503"
            ),
          locationUuid: Joi.string().required().description("Location uuid"),
        }),
      },
      tags: ["api", "hie", "facility-registry"],
      description: "Search for a healthcare facility in the Facility Registry",
      notes: "Proxies the HIE /v1/facility-search endpoint using facility_code",
    },
    handler: async (request, h) => {
      const facilitySearchDto = request.query as FacilityFilterDto;
      const service = new FacilityRegistryService(
        facilitySearchDto.locationUuid
      );

      try {
        const result = await service.searchFacilityByCode(facilitySearchDto);
        return h.response(result).code(200);
      } catch (error: any) {
        logger.error(
          `Facility search failed: ${facilitySearchDto.filterValue} - ${error.message}`
        );
        return h
          .response({
            error: "Facility search failed",
            details: error.message,
          })
          .code(400);
      }
    },
  },

  {
    method: "POST",
    path: "/hie/facility-credentials",
    options: {
      validate: {
        payload: Joi.object({
          facility_code: Joi.string().required().description("Facility Code"),
          consumer_key: Joi.string().required().description("HIE Consumer Key"),
          username: Joi.string().required().description("HIE Username"),
          password: Joi.string().required().description("HIE Password"),
          agent: Joi.string().required().description("HIE Agent"),
          is_active: Joi.boolean()
            .default(true)
            .description("Whether credentials are active"),
        }),
      },
      tags: ["api", "hie", "facility-credentials"],
      description: "Save or update facility credentials for HIE authentication",
      notes: "Stores facility credentials with encrypted password.",
    },
    handler: async (request, h) => {
      const credentialsData = request.payload as any;
      const service = new HieMappingService();

      try {
        const result = await service.saveCredentials(credentialsData);
        return h
          .response({
            message: "Credentials saved successfully",
            data: result,
          })
          .code(200);
      } catch (error: any) {
        logger.error(`Failed to save facility credentials: ${error.message}`);
        return h
          .response({
            error: "Failed to save facility credentials",
            details: error.message,
          })
          .code(400);
      }
    },
  },
  {
    method: "PUT",
    path: "/hie/facility-credentials/{locationUuid}/status",
    options: {
      validate: {
        params: Joi.object({
          locationUuid: Joi.string()
            .uuid()
            .required()
            .description("Facility location UUID"),
        }),
        payload: Joi.object({
          is_active: Joi.boolean().required().description("Activation status"),
        }),
      },
      tags: ["api", "hie", "facility-credentials"],
      description: "Update facility credentials status",
      notes: "Activate or deactivate facility credentials.",
    },
    handler: async (request, h) => {
      const { locationUuid } = request.params;
      const { is_active } = request.payload as { is_active: boolean };
      const service = new HieMappingService();

      try {
        const result = await service.updateCredentialsStatus(
          locationUuid,
          is_active
        );
        if (!result) {
          return h
            .response({
              error: "Credentials not found for the specified facility",
            })
            .code(404);
        }
        return h
          .response({
            message: `Credentials ${is_active ? "activated" : "deactivated"
              } successfully`,
          })
          .code(200);
      } catch (error: any) {
        logger.error(`Failed to update credentials status: ${error.message}`);
        return h
          .response({
            error: "Failed to update credentials status",
            details: error.message,
          })
          .code(400);
      }
    },
  },
  // SHR Fetch Endpoint
  {
    method: "GET",
    path: "/hie/v1/shr/summary",
    options: {
      validate: {
        query: Joi.object({
          cr_id: Joi.string()
            .required()
            .description("Client Registry ID (CRXXXXX)"),
          locationUuid: Joi.string()
            .uuid()
            .required()
            .description("Location UUID"),
          resources: Joi.string().optional(),
          sort: Joi.string().valid("asc", "desc").optional(),
          count: Joi.number().integer().min(1).optional(),
          offset: Joi.number().integer().min(0).optional(),
        }),
      },
      tags: ["api", "shr"],
      description: "Fetch SHR summary data by Client Registry ID",
      notes: "Retrieves summary data from SHR using the provided CR ID",
    },
    handler: async (request, h) => {
      const { cr_id, locationUuid, resources, sort, count, offset } = request.query as {
        cr_id: string;
        locationUuid: string;
        resources?: string;
        sort?: string;
        count?: number;
        offset?: number;
      };
      const startTime = new Date();
      const orchestrations = [];

      try {
        const service = new SHRService(locationUuid);

        // Create orchestration for SHR fetch
        const shrRequestStart = new Date().toISOString();
        const data = await service.fetchSHR(cr_id, locationUuid, {
          resources,
          sort,
          count,
          _offset: offset,
        });
        const shrRequestEnd = new Date().toISOString();

        // Log the SHR orchestration
        const shrOrchestration = MediatorUtils.createOrchestration(
          "SHR Summary Fetch",
          "GET",
          `${request.server.info.uri}/v1/shr/summary?cr_id=${cr_id}`,
          null,
          200,
          data,
          {},
          { "Content-Type": "application/json" }
        );
        orchestrations.push(shrOrchestration);

        // Second orchestration to post to OpenHIM FHIR endpoint
        try {
          logger.debug(
            `Posting transformed bundle for patient ${cr_id} to OpenHIM`
          );
          const openHimRequestStart = new Date().toISOString();
          const openHimResponse = await service.postBundleToOpenHIM(data);
          const openHimRequestEnd = new Date().toISOString();

          // Log the OpenHIM orchestration
          const openHimOrchestration = MediatorUtils.createOrchestration(
            "OpenHIM FHIR Bundle Post",
            "POST",
            `${config.HIE.OPENHIM_BASE_URL}${config.HIE.OPENHIM_FHIR_ENDPOINT}`,
            data,
            200,
            openHimResponse,
            {},
            { "Content-Type": "application/fhir+json" }
          );
          orchestrations.push(openHimOrchestration);

          logger.debug(
            `Successfully posted bundle for patient ${cr_id} to OpenHIM`
          );
        } catch (openHimError: any) {
          logger.error(
            `Failed to post bundle to OpenHIM for patient ${cr_id}: ${openHimError.message}`
          );

          // Log the failed OpenHIM orchestration
          const openHimErrorOrchestration = MediatorUtils.createOrchestration(
            "OpenHIM FHIR Bundle Post - Error",
            "POST",
            `${config.HIE.OPENHIM_BASE_URL}${config.HIE.OPENHIM_FHIR_ENDPOINT}`,
            data,
            500,
            { error: openHimError.message },
            {},
            { "Content-Type": "application/fhir+json" }
          );
          orchestrations.push(openHimErrorOrchestration);

          // Continue execution - don't fail the entire operation if OpenHIM post fails
        }

        // Create mediator response
        const mediatorResponse = MediatorUtils.createMediatorResponse(
          request,
          200,
          data,
          orchestrations,
          {
            cr_id: cr_id,
            timestamp: new Date().toISOString(),
            processingTime: Date.now() - startTime.getTime(),
          }
        );

        return MediatorUtils.sendMediatorResponse(h, mediatorResponse);
      } catch (error: any) {
        logger.error(`SHR summary fetch failed: ${cr_id} - ${error.message}`);

        // Create orchestration for the failed request
        const errorOrchestration = MediatorUtils.createOrchestration(
          "SHR Summary Fetch - Error",
          "GET",
          `${request.server.info.uri}/v1/shr/summary?cr_id=${cr_id}`,
          null,
          500,
          { error: error.message },
          {},
          { "Content-Type": "application/json" }
        );
        orchestrations.push(errorOrchestration);

        const mediatorResponse = MediatorUtils.createMediatorResponse(
          request,
          400,
          {
            error: "SHR summary fetch failed",
            details: error.message,
          },
          orchestrations,
          {
            cr_id: cr_id,
            timestamp: new Date().toISOString(),
            processingTime: Date.now() - startTime.getTime(),
            error: true,
          }
        );

        return MediatorUtils.sendMediatorResponse(h, mediatorResponse);
      }
    },
  },

  // SHR Post Bundle Endpoint
  {
    method: "POST",
    path: "/v1/shr/bundle",
    options: {
      validate: {
        payload: Joi.object({
          resourceType: Joi.string().required(),
          type: Joi.string().required(),
          entry: Joi.array()
            .items(
              Joi.object({
                fullUrl: Joi.string().optional(),
                resource: Joi.object().required(),
              }).unknown(true)
            )
            .required(),
        }).unknown(true),
      },
      tags: ["api", "shr"],
      description: "Post bundle to SHR",
      notes: "Posts bundle to SHR",
    },
    handler: async (request, h) => {
      const { locationUuid } = request.query as { locationUuid: string };
      const payload = request.payload as any;
      const bundle =
        payload && payload.bundle
          ? payload.bundle
          : (payload as FhirBundle<any>);
      const service = new SHRService(locationUuid);
      try {
        const data = await service.postBundleToSHR(bundle);
        return h.response(data).code(200);
      } catch (error: any) {
        logger.error(`SHR bundle post failed: ${error.message}`);
        return h
          .response({
            error: "SHR bundle post failed",
            details: error.message,
          })
          .code(400);
      }
    },
  },

  // SHR Batch job endpoint
  {
    method: "POST",
    path: "/v1/shr/batch-job",
    options: {
      validate: {
        payload: Joi.object({
          date: Joi.string()
            .optional()
            .description(
              "Date to process (YYYY-MM-DD format), defaults to yesterday"
            ),
        }),
      },
      tags: ["api", "shr", "batch"],
      description: "Trigger SHR batch job for processing closed visits",
      notes:
        "Processes all closed visits for the specified date (defaults to yesterday) and pushes them to SHR",
    },
    handler: async (request, h) => {
      const { date } = request.payload as { date?: string };

      try {
        const service = new KafkaConsumerService();
        const jobDate = date ? new Date(date) : new Date();
        const result = await service.executeBatchJob(jobDate);

        return h.response(result).code(200);
      } catch (error: any) {
        logger.error(`SHR batch job failed: ${error.message}`);
        return h
          .response({
            error: "SHR batch job failed",
            details: error.message,
          })
          .code(500);
      }
    },
  },

  {
    method: "POST",
    path: "/v1/shr/test-patient-bundle",
    options: {
      validate: {
        payload: Joi.object({
          patientUuid: Joi.string()
            .required()
            .description("Patient UUID to test"),
          date: Joi.string()
            .optional()
            .description(
              "Date to use for testing (YYYY-MM-DD format), defaults to yesterday"
            ),
        }),
      },
      tags: ["api", "shr", "test"],
      description: "Test bundle generation for a single patient",
      notes:
        "Generates a bundle for the specified patient without pushing to SHR, for testing purposes",
    },
    handler: async (request, h) => {
      const { locationUuid } = request.query as { locationUuid: string };
      const { patientUuid, date } = request.payload as {
        patientUuid: string;
        date?: string;
      };

      try {
        const service = new SHRService(locationUuid);
        const result = await service.testPatientBundle(patientUuid, date);

        return h.response(result).code(200);
      } catch (error: any) {
        logger.error(`SHR test bundle generation failed: ${error.message}`);
        return h
          .response({
            error: "SHR test bundle generation failed",
            details: error.message,
          })
          .code(500);
      }
    },
  },

  // Health Check Endpoint
  {
    method: "GET",
    path: "/hie/health",
    options: {
      tags: ["api", "monitoring"],
      description: "Service health check",
    },
    handler: async (request, h) => {
      return h
        .response({
          status: "ok",
          timestamp: new Date().toISOString(),
          service: "hie-integration",
        })
        .code(200);
    },
  },

  // Kafka Health Check Endpoint
  {
    method: "GET",
    path: "/hie/kafka/health",
    options: {
      tags: ["api", "monitoring", "kafka"],
      description: "Kafka consumer health check",
    },
    handler: async (request, h) => {
      try {
        const healthStatus = await kafkaConsumerService.getHealthStatus();
        return h.response(healthStatus).code(200);
      } catch (error: any) {
        logger.error(`Kafka health check failed: ${error.message}`);
        return h
          .response({
            error: "Kafka health check failed",
            details: error.message,
            timestamp: new Date().toISOString(),
          })
          .code(500);
      }
    },
  },

  // Kafka Consumer Status Endpoint
  {
    method: "GET",
    path: "/hie/kafka/status",
    options: {
      tags: ["api", "monitoring", "kafka"],
      description: "Detailed Kafka consumer status",
    },
    handler: async (request, h) => {
      try {
        const status = await kafkaConsumerService.getConsumerStatus();
        return h.response(status).code(200);
      } catch (error: any) {
        logger.error(`Kafka status check failed: ${error.message}`);
        return h
          .response({
            error: "Kafka status check failed",
            details: error.message,
            timestamp: new Date().toISOString(),
          })
          .code(500);
      }
    },
  },
];
