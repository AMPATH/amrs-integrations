import config from "@amrs-integrations/core";
import { COUNTRY_CODE_ATTRIBUTE_TYPE_UUID } from "../constants";

export async function getPatientIdentifiers(patientUUID: string) {
  const httpClient = new config.HTTPInterceptor(
    config.amrsUrl || "",
    config.amrsUsername || "",
    config.amrsPassword || "",
    "amrs"
  );
  let identifiers = await httpClient.axios(
    "/ws/rest/v1/patient/" + patientUUID + "/identifier",
    {
      method: "GET",
    }
  );

  return identifiers;
}

export async function saveCountryAttribute(patientUuid:string, countryCode:string) {
  const payload = {
    attributeType: "8d871afc-c2cc-11de-8d13-0010c6dffd0f",
    value: countryCode,
  };

  const httpClient = new config.HTTPInterceptor(
    config.amrsUrl || "",
    config.amrsUsername || "",
    config.amrsPassword || "",
    "amrs"
  );
  return await httpClient.axios.post(
    "/ws/rest/v1/patient/" + patientUuid + "/attribute",
    payload
  )
}

export async function saveUpiIdentifier(
  upi: string,
  patientUuid: string,
  locationUuid: string
) {
  const payload = {
    identifier: upi,
    identifierType: COUNTRY_CODE_ATTRIBUTE_TYPE_UUID,
    location: locationUuid,
    preferred: false,
  };

  const httpClient = new config.HTTPInterceptor(
    config.amrsUrl || "",
    config.amrsUsername || "",
    config.amrsPassword || "",
    "amrs"
  );
  return await httpClient.axios.post(
    "/ws/rest/v1/patient/" + patientUuid + "/identifier",
    payload
  )
}
