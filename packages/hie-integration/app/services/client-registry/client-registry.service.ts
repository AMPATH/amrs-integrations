import axios from "axios";
import config from "../../config/env";
import {
  EncryptedClientResp,
} from "../../types/hie.type";
import { logger } from "../../utils/logger";
import { HieHttpClient } from "../../utils/http-client";
import { decryptData } from "../../utils/descrypt-data";

export class ClientRegistryService {
  private httpClient = new HieHttpClient();

  async fetchPatientFromHie(
    identificationNumber: string,
    idType: string = "National ID"
  ): Promise<any> {
    try {
      const response = await this.httpClient.get<EncryptedClientResp>(
        config.HIE.CLIENT_REGISTRY_URL,
        {
          identification_type: idType,
          identification_number: identificationNumber,
          agent: config.HIE.AGENT,
        }
      );

      if (!response.data || response.data.message.total === 0) {
        throw new Error("Patient not found in HIE registry");
      }

      if (response.data.message.result) {
        const patientData = response.data.message.result.map((d) => {
          return decryptData(d._pii);
        });

        return patientData;
      }
      return response.data.message.result || [];
    } catch (error: any) {
      console.log("error", error);
      logger.error(`HIE client registry request failed: ${error.message}`);
      throw new Error(
        `Failed to fetch patient from HIE: ${
          error.response?.data || error.message
        }`
      );
    }
  }

}
