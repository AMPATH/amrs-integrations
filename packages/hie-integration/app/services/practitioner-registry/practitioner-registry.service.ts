import { PractitionerRepository } from "../../repositories/PractitionerRepository";
import {
  Identifier,
  IdentifierType,
  PractitionerRegistryResponse,
} from "../../types/hie.type";
import { HieHttpClient } from "../../utils/http-client";
import config from "../../config/env";
import { logger } from "../../utils/logger";
import { AmrsProviderService } from "../amrs/amrs-provider.service";

export class PractitionerRegistryService {
  private repository: PractitionerRepository;
  private httpClient = new HieHttpClient(config.HIE.BASE_URL);
  private amrsProviderService = new AmrsProviderService();

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
      let providerUuid;
      // first lets get the provider uuid if identifier is of type nation-id from amrs
      if (identifier.type === IdentifierType.NATIONAL_ID) {
        const result = await this.amrsProviderService.getProviderByNationalId(
          identifier.value
        );
        // Workaround:
        const provider = Array.isArray(result) ? result[3] : result;

        if (provider) {
          providerUuid = provider.provider_uuid;
        }
      }
      const registryData = await this.fetchPractitionerFromHie(identifier);

      await this.repository.saveRecord(
        identifier,
        registryData,
        validityDays,
        providerUuid
      );

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

      const message = response.data.message as any;

      if (message.error) {
        throw new Error(message.error);
      }

      if (message.found === 0) {
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
