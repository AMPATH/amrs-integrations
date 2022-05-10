import config from "@amrs-integrations/core";

export async function getPatientIdentifiers(patientUUID: string) {
  let httpClient = new config.HTTPInterceptor(
    config.amrsUrl || "",
    config.amrsUsername || "",
    config.amrsPassword || "",
    "amrs"
  );
  let identifiers = await httpClient.axios(
    "/ws/rest/v1/patient/" + patientUUID + "/identifier",
    {
      method: "get",
    }
  );

  return identifiers;
}

export async function saveUpiIdentifier(
  upi: string,
  patientUuid: string,
  locationUuid: string
) {
  const payload = {
    identifier: upi,
    identifierType: "cba702b9-4664-4b43-83f1-9ab473cbd64d",
    location: locationUuid,
    preferred: false,
  };

  let httpClient = new config.HTTPInterceptor(
    config.amrsUrl || "",
    config.amrsUsername || "",
    config.amrsPassword || "",
    "amrs"
  );
  return await httpClient.axios.post(
    "/ws/rest/v1/patient/" + patientUuid + "/identifier",
    payload
  );
}
