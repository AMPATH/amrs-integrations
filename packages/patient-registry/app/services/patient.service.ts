import config from "@amrs-integrations/core";
import getAccessToken from "../helpers/auth";
import { saveUpiIdentifier, getPatientIdentifiers } from "../helpers/patient";
import { getPatient, getFacilityMfl } from "../models/queries";
import Gender from "../ClientRegistryLookupDictionaries/gender";
import IdentificationTypes from "../ClientRegistryLookupDictionaries/identification-types";

export default class PatientService {
  public async searchPatientByID(params: any) {
    let accessToken = await getAccessToken();
    let httpClient = new config.HTTPInterceptor(
      config.dhp.url || "",
      "",
      "",
      "dhp",
      accessToken.access_token
    );

    /**TODO: Check against all allowed identifier types (national id, birth number and passport) */
      const url = "/search/identification-number/" + params.uno;
      let dhpResponse: PatientPayload.ClientObject = await httpClient.axios(
        url,
        { method: "get" }
      );

      console.log("dhpResponse ", dhpResponse);

      return dhpResponse;
  }

  public async searchPatient(params: any) {
    let accessToken = await getAccessToken();
    let httpClient = new config.HTTPInterceptor(
      config.dhp.url || "",
      "",
      "",
      "dhp",
      accessToken.access_token
    );

    let identifiers = await getPatientIdentifiers(params.patientUuid);
    const nationalId = identifiers.results.filter(
      (e: any) =>
        e.identifierType.uuid == "58a47054-1359-11df-a1f1-0026b9348838"
    );
    /**TODO: Check against all allowed identifier types (national id, birth number and passport) */
    if (nationalId !== undefined || nationalId.length != 0) {
      const url = "/search/identification-number/" + nationalId[0].identifier;
      let dhpResponse: PatientPayload.ClientObject = await httpClient.axios(
        url,
        { method: "get" }
      );

      console.log(
        "Does client exist ",
        dhpResponse.clientExists,
        nationalId[0].location.uuid
      );
      if (dhpResponse.clientExists) {
        console.log("DHP client number", dhpResponse.client.clientNumber);

        let savedUpi = await this.saveUpiNumber(
          dhpResponse.client.clientNumber,
          params.patientUuid,
          nationalId[0].location.uuid
        );
        console.log("Saved UPI, Existing Patient", savedUpi.identifier);
        return;
      }

      /** Patient not found: Construct payload and save to Registry*/
      let payload = await this.constructPayload(
        params.patientUuid,
        nationalId[0].location.uuid
      );

      httpClient.axios
        .post("", payload)
        .then(async (dhpResponse: any) => {
          let savedUpi: any = await this.saveUpiNumber(
            dhpResponse.clientNumber,
            params.patientUuid,
            nationalId[0].location.uuid
          );
          console.log("Saved UPI, New Patient", savedUpi.identifier);
        })
        .catch((err: any) => {
          console.log("Error creating patient ", err);
        });

      /** TODO: Incase of error, queue patient in Redis */

      return payload;
    }
  }

  private async constructPayload(patientUuid: string, locationUuid: string) {
    let p: any = await getPatient(patientUuid);
    //let mflCode = await getFacilityMfl(locationUuid);
    let identifiers: PatientPayload.PatientIdentifier[] = await getPatientIdentifiers(
      patientUuid
    );
    let allowedIDS = await this.extractAllowedIdentifiers(identifiers);

    const payload = {
      firstName: p.FirstName,
      middleName: p.MiddleName,
      lastName: p.LastName,
      dateOfBirth: p.DateOfBirth,
      maritalStatus: p.MaritalStatus,
      gender: this.mapGender(p.Gender),
      occupation: "",
      religion: "",
      educationLevel: "",
      country: "Kenya",
      countryOfBirth: "Kenya",
      residence: {
        county: "Nairobi",
        subCounty: "Dagorreti",
        ward: "Ngeria",
        village: "Ngeria",
        landmark: "Ngeria",
        address: "",
      },
      identifications: allowedIDS,
      contact: {
        primaryPhone: p.PrimaryPhone,
        secondaryPhone: p.SecondaryPhone,
        emailAddress: "",
      },
      nextOfKins: [],
    };

    return payload;
  }

  private async saveUpiNumber(
    upi: string,
    patientUuid: string,
    locationUuid: string
  ) {
    const result = await saveUpiIdentifier(upi, patientUuid, locationUuid);
    console.log("result", result);
    return result;
  }

  private async extractAllowedIdentifiers(identifiers: any) {
    const allowedIdentifiers = [
      "58a47054-1359-11df-a1f1-0026b9348838",
      "ced014a1-068a-4a13-b6b3-17412f754af2",
      "7924e13b-131a-4da8-8efa-e294184a1b0d",
    ];
    let payloadIdentifiers: any = [];
    identifiers.results.forEach((e: any) => {
      if (allowedIdentifiers.includes(e.identifierType.uuid)) {
        payloadIdentifiers.push({
          IdentificationType: this.mapIDTypes(e.identifierType.uuid),
          IdentificationNumber: e.identifier,
        });
      }
    });

    return payloadIdentifiers;
  }

  private mapGender(g: string) {
    const gender: any = Gender.filter((r) => r.amrs == g);
    return gender[0].value;
  }

  private mapIDTypes(amrsId: string) {
    const idType = IdentificationTypes.filter((i) => (i.amrs = amrsId));
    return idType[0].value;
  }
}
