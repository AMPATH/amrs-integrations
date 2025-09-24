import { PractitionerRepository } from "../../repositories/PractitionerRepository";
import {
  Identifier,
  IdentifierType,
  PractitionerRegistryResponse,
} from "../../types/hie.type";
import { HieHttpClient } from "../../utils/http-client";
import config from "../../config/env";
import { logger } from "../../utils/logger";

export class PractitionerRegistryService {
  private repository: PractitionerRepository;
  private httpClient = new HieHttpClient(config.HIE.BASE_URL);

  constructor() {
    this.repository = new PractitionerRepository();
  }

  async getPractitioner(
    identifier: Identifier,
    options: { refresh?: boolean; validityDays?: number } = {}
  ): Promise<PractitionerRegistryResponse> {
    const { refresh = false, validityDays = 7 } = options;

    const localRecord = await this.repository.findByIdentifier(identifier);

    let shouldFetchFromHie = refresh;

    if (!shouldFetchFromHie && localRecord) {
      const now = new Date();
      const expired = localRecord.validUntil! < now;
      shouldFetchFromHie = expired;
      if (!expired) {
        return localRecord.registryData;
      }
    }

    // fetch from HIE
    try {
      const registryData = await this.fetchPractitionerFromHie(identifier);

      await this.repository.saveRecord(identifier, registryData, validityDays);

      return registryData;
    } catch (error) {
      if (localRecord) {
        console.warn("Using local data due to HIE failure");
        return localRecord.registryData;
      }
      throw error;
    }
  }

  async fetchPractitionerFromHie(
    identifier: Identifier
  ): Promise<PractitionerRegistryResponse> {
    try {
      let queryParams: Record<string, string>;

      switch (identifier.type) {
        case IdentifierType.REGISTRATION_NUMBER:
          queryParams = {
            registration_number: identifier.value,
          };
          break;

        case IdentifierType.LICENSE_NO:
          queryParams = {
            id: identifier.value,
          };
          break;

        default:
          queryParams = {
            identification_type: identifier.type,
            identification_number: identifier.value,
          };
          break;
      }

      const queryString = new URLSearchParams(queryParams).toString();
      const fullUrl = `${config.HIE.BASE_URL}${config.HIE.PRACTITIONER_REGISTRY_URL}`;
      const urlForLogging = `${fullUrl}?${queryString}`;

      const response = await this.httpClient.get<PractitionerRegistryResponse>(
        config.HIE.PRACTITIONER_REGISTRY_URL,
        queryParams
      );

      if (response.data.message.found === 0) {
        throw new Error("Practitioner not found in Practitioner Registry");
      }

      return response.data;
    } catch (error: any) {
      logger.error(
        `HIE Practitioner Registry request failed: ${error.message}`
      );
      throw new Error(
        `Failed to fetch practitioner from HIE: ${
          error.response?.data || error.message
        }`
      );
    }
  }
}
