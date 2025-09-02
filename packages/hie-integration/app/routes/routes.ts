import Joi from "joi";
import { ServerRoute } from "@hapi/hapi";
import { ClientRegistryService } from "../services/client-registry/client-registry.service";
import { FacilityRegistryService } from "../services/facility-registry/facility-registry.service";
import { logger } from "../utils/logger";
import { IdentifierType } from "../types/hie.type";
import { PractitionerRegistryService } from "../services/practitioner-registry/practitioner-registry.service";

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
