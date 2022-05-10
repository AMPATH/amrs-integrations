import { saveUpiIdentifier, getPatientIdentifiers } from "../helpers/patient";
import { getPatient, getFacilityMfl } from "../models/queries";

export default class PatientService {
  public async searchPatient(params: any) {
    /** TODO: search patient in registry */
    const mockResponse: any = {
      clientNumber: "MOH001",
    };

    /** If patient found, saveUpiNumber to amrs */
    if (mockResponse != null) {
      let savedUpi = await this.saveUpiNumber(
        mockResponse.clientNumber,
        params.patientUuid, params.locationUuid
      );
      console.log("Saved UPI ", savedUpi.identifier);
    }

    /** Patient not found: Construct payload */
    let res = await this.constructPayload(
      params.patientUuid,
      params.locationUuid
    );

    /** TODO: Post to registry */

    /** TODO: Call saveUpiNumber to save the UPI */

    /** TODO: Incase of error queue patient in Redis */

    return res;
  }

  private async constructPayload(patientUuid: string, locationUuid: string) {
    let res: PatientPayload.Patient = await getPatient(patientUuid);
    let mflCode = await getFacilityMfl(locationUuid);
    let identifiers: PatientPayload.PatientIdentifier[] = await getPatientIdentifiers(
      patientUuid
    );
    console.log("Fetched patient ", res.FirstName, "Facility mfl ", mflCode);
    return identifiers;
  }

  private async saveUpiNumber(upi: string, patientUuid: string, locationUuid: string) {
    const result = await saveUpiIdentifier(upi, patientUuid, locationUuid);
    return result;
  }
}
