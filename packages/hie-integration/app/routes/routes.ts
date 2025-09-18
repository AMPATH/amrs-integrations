import Joi from "joi";
import { ServerRoute } from "@hapi/hapi";
import { ClientRegistryService } from "../services/client-registry/client-registry.service";
import { HwrService } from "../services/hwr/hwr.service";
import { SHRService } from "../services/shr/shr.service";
import { logger } from "../utils/logger";
import { FhirBundle } from "../types/hie.type";

export const routes = (): ServerRoute[] => [
  // Client Registry Endpoints
  {
    method: "POST",
    path: "/hie/client/sync",
    options: {
      validate: {
        payload: Joi.object({
          identificationNumber: Joi.string()
            .required()
            .pattern(/^\d+$/)
            .description("National ID number"),
          identificationNumbeType: Joi.string()
            .optional()
            .default("National ID")
            .valid("National ID", "passport")
            .description("Identification type"),
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
        identificationNumbeType,
      } = request.payload as {
        identificationNumber: string;
        identificationNumbeType: string;
      };
      const service = new ClientRegistryService();

      try {
        const result = await service.syncPatient(
          identificationNumber,
          identificationNumbeType
        );
        logger.info(`Patient sync successful: ${identificationNumber}`);
        return h.response(result).code(200);
      } catch (error: any) {
        logger.error(
          `Patient sync failed: ${identificationNumber} - ${error.message}`
        );
        return h
          .response({
            error: "Patient sync failed",
            details: error.message,
          })
          .code(400);
      }
    },
  },
  {
    method: "POST",
    path: "/hie/client/search",
    options: {
      validate: {
        payload: Joi.object({
          identificationNumber: Joi.required().description(
            "Identification number"
          ),
          identificationNumbeType: Joi.string()
            .required()
            .valid("National ID", "passport")
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
        identificationNumbeType,
      } = request.payload as {
        identificationNumber: string;
        identificationNumbeType: string;
      };
      const service = new ClientRegistryService();

      try {
        const result = await service.fetchPatientFromHie(
          identificationNumber,
          identificationNumbeType
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
  // HWR Search Endpoint
  {
    method: "GET",
    path: "/hie/hwr/search",
    options: {
      validate: {
        query: Joi.object({
          nationalId: Joi.string()
            .required()
            .pattern(/^\d+$/)
            .description("National ID number"),
          idType: Joi.string()
            .optional()
            .default("national-id")
            .valid("national-id", "passport")
            .description("Identification type"),
        }),
      },
      tags: ["api", "hie", "hwr"],
      description: "Search for health worker in HWR",
      notes: "Directly searches the health worker registry by national ID",
    },
    handler: async (request, h) => {
      const { nationalId, idType } = request.query as {
        nationalId: string;
        idType: string;
      };
      const service = new HwrService();

      try {
        const result = await service.fetchPractitionerFromHie(
          nationalId,
          idType
        );
        return h.response(result).code(200);
      } catch (error: any) {
        logger.error(`HWR search failed: ${nationalId} - ${error.message}`);
        return h
          .response({
            error: "HWR search failed",
            details: error.message,
          })
          .code(400);
      }
    },
  },

  // Health Worker Registry Endpoints
  {
    method: "POST",
    path: "/hie/hwr/refresh-license",
    options: {
      validate: {
        payload: Joi.object({
          nationalId: Joi.string()
            .required()
            .pattern(/^\d+$/)
            .description("National ID number"),
          idType: Joi.string()
            .optional()
            .default("national-id")
            .valid("national-id", "passport")
            .description("Identification type"),
          providerUuid: Joi.string()
            .optional()
            .description("AMRS provider UUID"),
        }),
      },
      tags: ["api", "hie", "hwr"],
      description: "Refresh health worker license status",
      notes:
        "Checks latest license status from national registry and updates AMRS provider record",
    },
    handler: async (request, h) => {
      const { nationalId, idType, providerUuid } = request.payload as {
        nationalId: string;
        idType: string;
        providerUuid?: string;
      };
      const service = new HwrService();

      try {
        const result = await service.updateLicenseStatus(
          nationalId,
          providerUuid,
          idType
        );
        logger.info(`License refresh successful: ${nationalId}`);
        return h.response(result).code(200);
      } catch (error: any) {
        logger.error(
          `License refresh failed: ${nationalId} - ${error.message}`
        );
        return h
          .response({
            error: "License refresh failed",
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
        payload:
          Joi.object({
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
          }).unknown(true)
      },
      tags: ["api", "shr"],
      description: "Post bundle to SHR",
      notes: "Posts bundle to SHR",
    },
    handler: async (request, h) => {
      const payload = request.payload as any;
      const bundle = (payload && payload.bundle) ? payload.bundle : payload as FhirBundle<any>;
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

  // Health Check Endpoint
  {
    method: "GET",
    path: "/health",
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
