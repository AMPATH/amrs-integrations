import axios from "axios";
import config from "../../config/env";
import {
  HiePatient,
  FhirBundle,
  EncryptedClientResp,
} from "../../types/hie.type";
import { PatientMapper } from "./patient.mapper";
import { AmrsService } from "../amrs/amrs.service";
import { logger } from "../../utils/logger";
import { HieHttpClient } from "../../utils/http-client";
import { decryptData } from "../../utils/descrypt-data";

export class ClientRegistryService {
  private httpClient = new HieHttpClient();
  private amrsService = new AmrsService();

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

  async syncPatient(
    nationalId: string,
    idType: string = "National ID"
  ): Promise<any> {
    // Fetch from HIE
    const hiePatient = await this.fetchPatientFromHie(nationalId, idType);
    console.log("hiePatient", hiePatient);

    // return hiePatient;

    // Map to AMRS format
    const amrsPatient = PatientMapper.hieToAmrs(hiePatient);

    // Check existence in AMRS
    const existingPatient = await this.amrsService.findPatientByNationalId(
      nationalId //"566777878"
    );

    if (existingPatient) {
      // Return differences instead of updating
      return this.getPatientDifferences(existingPatient, amrsPatient);
      // return this.handleExistingPatient(existingPatient, amrsPatient);
    } else {
      // No existing patient
      return {
        action: "create",
        patientData: amrsPatient,
      };
      // return this.createNewPatient(amrsPatient);
    }
  }

  private getPatientDifferences(
    existing: any,
    updates: any
  ): { action: string; existing: any; updates: any; differences: any } {
    const differences: Record<string, { old: any; new: any }> = {};

    // Compare names
    const existingName =
      existing.person.preferredName || existing.person.names?.[0] || {};
    const updateName = updates.person.names?.[0] || {};

    if (existingName.givenName !== updateName.givenName) {
      differences.givenName = {
        old: existingName.givenName,
        new: updateName.givenName,
      };
    }

    if (existingName.familyName !== updateName.familyName) {
      differences.familyName = {
        old: existingName.familyName,
        new: updateName.familyName,
      };
    }

    // Compare birthdate
    if (existing.person.birthdate !== updates.person.birthdate) {
      differences.birthdate = {
        old: existing.person.birthdate,
        new: updates.person.birthdate,
      };
    }

    // Compare gender
    if (existing.person.gender !== updates.person.gender) {
      differences.gender = {
        old: existing.person.gender,
        new: updates.person.gender,
      };
    }

    // Add more fields to compare as needed

    return {
      action: "update",
      existing: existing,
      updates: updates,
      differences: Object.keys(differences).length ? differences : null,
    };
  }

  private async handleExistingPatient(
    existing: any,
    updates: any
  ): Promise<any> {
    // Check if updates are needed
    const needsUpdate = this.needsUpdate(existing, updates);

    console.log("needsUpdate", needsUpdate);

    // if (needsUpdate) {
    //   return this.amrsService.updatePatient(existing.uuid, updates);
    // }

    return existing;
  }

  private needsUpdate(existing: any, updates: any): boolean {
    // Prefer preferredName if available, otherwise fallback to names[0]
    const existingName =
      existing.person.preferredName || existing.person.names?.[0] || {};
    const updateName = updates.person.names?.[0] || {};

    return (
      existingName.givenName !== updateName.givenName ||
      existingName.familyName !== updateName.familyName ||
      existing.person.birthdate !== updates.person.birthdate
    );
  }

  private async createNewPatient(patientData: any): Promise<any> {
    return this.amrsService.createPatient(patientData);
  }
}
