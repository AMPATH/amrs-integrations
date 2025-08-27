import Joi from "joi";
import { ServerRoute } from "@hapi/hapi";
import { ClientRegistryService } from "../services/client-registry/client-registry.service";
import { HwrService } from "../services/hwr/hwr.service";
import { logger } from "../utils/logger";

export const routes = (): ServerRoute[] => [
  // Client Registry Endpoints
  {
    method: "POST",
    path: "/hie/client/sync",
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
        }),
      },
      tags: ["api", "hie", "client-registry"],
      description: "Sync patient data from HIE client registry",
      notes:
        "Fetches patient data from national registry, compares with AMRS, and updates if necessary",
    },
    handler: async (request, h) => {
      const { nationalId, idType } = request.payload as {
        nationalId: string;
        idType: string;
      };
      const service = new ClientRegistryService();

      try {
        const result = await service.syncPatient(nationalId, idType);
        logger.info(`Patient sync successful: ${nationalId}`);
        return h.response(result).code(200);
      } catch (error: any) {
        logger.error(`Patient sync failed: ${nationalId} - ${error.message}`);
        return h
          .response({
            error: "Patient sync failed",
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
