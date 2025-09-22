import Joi from "joi";
import { ServerRoute } from "@hapi/hapi";
import { ClientRegistryService } from "../services/client-registry/client-registry.service";
import { FacilityRegistryService } from "../services/facility-registry/facility-registry.service";
import { logger } from "../utils/logger";
import {
  FhirBundle,
  IdentifierType,
  PatientSearchPayload,
} from "../types/hie.type";
import { PractitionerRegistryService } from "../services/practitioner-registry/practitioner-registry.service";
import { AmrsProviderService } from "../services/amrs/amrs-provider.service";
import { SHRService } from "../services/shr/shr.service";

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
      } = request.payload as PatientSearchPayload;
      const service = new ClientRegistryService();

      try {
        const result = await service.fetchPatientFromHie(
          identificationNumber,
          identificationType
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
        }),
      },
      tags: ["api", "hie", "client-registry", "otp"],
      description: "Validate OTP and search for patient",
    },
    handler: async (request, h) => {
      const { sessionId, otp } = request.payload as {
        sessionId: string;
        otp: string;
      };

      const service = new ClientRegistryService();

      try {
        const result = await service.validateOtp(sessionId, otp);

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
        }),
      },
      tags: ["api", "hie", "client-registry", "otp"],
      description: "Send OTP to patient's phone number",
    },
    handler: async (request, h) => {
      const {
        identificationNumber,
        identificationType,
      } = request.payload as PatientSearchPayload;

      const service = new ClientRegistryService();

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
        }),
      },
      tags: ["api", "hie", "practitioner-registry"],
      description: "Search for health practitioner in Practitioner Registry",
      notes:
        "Searches the national practitioner registry by ID, with local storage",
    },
    handler: async (request, h) => {
      const { identifierValue, identifierType, refresh } = request.query as {
        identifierValue: string;
        identifierType: IdentifierType;
        refresh: boolean;
      };

      const service = new PractitionerRegistryService();

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
          facilityCode: Joi.string()
            .required()
            .pattern(/^\d+$/)
            .description("Facility code as assigned in HIE (e.g. 24749)"),
        }),
      },
      tags: ["api", "hie", "facility-registry"],
      description: "Search for a healthcare facility in the Facility Registry",
      notes: "Proxies the HIE /v1/facility-search endpoint using facility_code",
    },
    handler: async (request, h) => {
      const { facilityCode } = request.query as { facilityCode: string };
      const service = new FacilityRegistryService();

      try {
        const result = await service.searchFacilityByCode(facilityCode);
        return h.response(result).code(200);
      } catch (error: any) {
        logger.error(
          `Facility search failed: ${facilityCode} - ${error.message}`
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
  // SHR Fetch Endpoint
  {
    method: "GET",
    path: "/v1/shr/summary",
    options: {
      validate: {
        query: Joi.object({
          cr_id: Joi.string()
            .required()
            .description("Client Registry ID (CRXXXXX)"),
        }),
      },
      tags: ["api", "shr"],
      description: "Fetch SHR summary data by Client Registry ID",
      notes: "Retrieves summary data from SHR using the provided CR ID",
    },
    handler: async (request, h) => {
      const { cr_id } = request.query as { cr_id: string };
      try {
        const service = new SHRService();
        const data = await service.fetchPatientFromSHR(cr_id);
        return h.response(data).code(200);
      } catch (error: any) {
        logger.error(`SHR summary fetch failed: ${cr_id} - ${error.message}`);
        return h
          .response({
            error: "SHR summary fetch failed",
            details: error.message,
          })
          .code(400);
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
      const payload = request.payload as any;
      const bundle =
        payload && payload.bundle
          ? payload.bundle
          : (payload as FhirBundle<any>);
      const service = new SHRService();
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
        const service = new SHRService();
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
      const { patientUuid, date } = request.payload as {
        patientUuid: string;
        date?: string;
      };

      try {
        const service = new SHRService();
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
];
