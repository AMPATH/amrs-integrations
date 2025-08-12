import axios from "axios";
import { TokenService } from "../auth/token.service";
import config from "../../config/env";
import { HiePatient, FhirBundle } from "../../types/hie.type";
import { PatientMapper } from "./patient.mapper";
import { AmrsService } from "../amrs/amrs.service";
import { logger } from "../../utils/logger";

export class ClientRegistryService {
  private tokenService = new TokenService();
  private amrsService = new AmrsService();

  async fetchPatientFromHie(nationalId: string): Promise<HiePatient> {
    const token = await this.tokenService.getAccessToken();
    const url = `${config.HIE.CLIENT_REGISTRY_URL}?identifierType=National ID&identifierNumber=${nationalId}`;

    try {
      const response = await axios.get<FhirBundle<HiePatient>>(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.total === 0) {
        throw new Error("Patient not found in HIE registry");
      }

      return response.data.entry[0].resource;
    } catch (error: any) {
      logger.error(`HIE client registry request failed: ${error.message}`);
      throw new Error(
        `Failed to fetch patient from HIE: ${
          error.response?.data || error.message
        }`
      );
    }
  }

  async syncPatient(nationalId: string): Promise<any> {
    // Fetch from HIE
    const hiePatient = await this.fetchPatientFromHie(nationalId);

    // Map to AMRS format
    const amrsPatient = PatientMapper.hieToAmrs(hiePatient);

    console.log("hiePatient", hiePatient);
    console.log("amrsPatient", amrsPatient);

    // Check existence in AMRS
    // const existingPatient = await this.amrsService.findPatientByNationalId(
    //   nationalId
    // );

    // if (existingPatient) {
    //   return this.handleExistingPatient(existingPatient, amrsPatient);
    // } else {
    //   return this.createNewPatient(amrsPatient);
    // }
  }

  private async handleExistingPatient(
    existing: any,
    updates: any
  ): Promise<any> {
    // Check if updates are needed
    const needsUpdate = this.needsUpdate(existing, updates);

    if (needsUpdate) {
      return this.amrsService.updatePatient(existing.uuid, updates);
    }

    return existing;
  }

  private needsUpdate(existing: any, updates: any): boolean {
    // Compare critical fields
    const existingName = existing.person.names.find((n: any) => n.preferred);
    const updateName = updates.person.names[0];

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
