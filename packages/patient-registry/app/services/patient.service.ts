import config from "@amrs-integrations/core";
import { validateToken } from "../helpers/auth";
import {
  saveUpiIdentifier,
  getPatientIdentifiers,
  saveCountryAttribute,
} from "../helpers/patient";
import { getPatient, getFacilityMfl } from "../models/queries";
import Gender from "../ClientRegistryLookupDictionaries/gender";
import Countries from "../ClientRegistryLookupDictionaries/countries";
import Counties from "../ClientRegistryLookupDictionaries/counties";
import IdentificationTypes from "../ClientRegistryLookupDictionaries/identification-types";
import { Consumer, Message, Producer } from "redis-smq";
import Religion from "../ClientRegistryLookupDictionaries/religions";
import MaritalStatus from "../ClientRegistryLookupDictionaries/marital-status";
import EducationLevels from "../ClientRegistryLookupDictionaries/education-levels";
import SlackService from "../monitoring/slack-service";
import fetch from "node-fetch";

import {
  BIRTH_CERTIFICATE_UUID,
  NATIONAL_UUID,
  PASSPORT_UUID,
} from "../constants";

const slackService = new SlackService();

// Patient Verification workflow
/**
 * 1. Search for client (National ID/Birth certificate Number/Passport Number) in the registry.(MOH client registry)
 * 2. If the client exists;
 *      - Get the client details
 *      - Update client on AMRS system with the MOH patient Identifier
 *      -
 * 3. If the client doesn't;
 *      - Register the client into the client registry
 *      - Get the Assigned MOH number then save into AMRS system as Patient Identifier
 *      - Introduce status PENDING verification, VERIFIED, UNVERIFIED, FAILED
 *      - UNVERIFIED -> PENDING_VERIFICATION/WAITING_FOR_VERIFICATION -> VERIFIED/FAILED_VERIFICATION
 */

export interface IdentifierParam {
  idParam: string;
  location: string;
  identifier: string;
}

const getIdentifierParam = (identifiersMap: any) => {
  let identifierParam: IdentifierParam = {
    idParam: "",
    location: "",
    identifier: "",
  };

  identifiersMap.results.forEach((identifier: any) => {
    if (identifier.identifierType.uuid === NATIONAL_UUID) {
      identifierParam = {
        idParam: "national-id",
        identifier: identifier.identifier,
        location: identifier.location.uuid,
      };
    } else if (identifier.identifierType.uuid === BIRTH_CERTIFICATE_UUID) {
      identifierParam = {
        idParam: "birth-certificate",
        identifier: identifier.identifier,
        location: identifier.location.uuid,
      };
    } else if (identifier.identifierType.uuid === PASSPORT_UUID) {
      identifierParam = {
        idParam: "passport",
        identifier: identifier.identifier,
        location: identifier.location.uuid,
      };
    }
  });
  return identifierParam;
};

const getSearchTypeParam = (type: String) => {
  // default search Id type - national ID
  let searchType = "national-id";
  switch (type) {
    case NATIONAL_UUID:
      searchType = "national-id";
      break;
    case BIRTH_CERTIFICATE_UUID:
      searchType = "birth-certificate";
      break;
    case PASSPORT_UUID:
      searchType = "passport";
      break;
    default:
      searchType = "";
  }
  return searchType;
};

const getAMRSNumber = (identifiers: any) => {
  const universalId = identifiers.results.filter(
    (id: any) =>
      id.identifierType.uuid == "58a4732e-1359-11df-a1f1-0026b9348838"
  );
  return universalId[0]?.identifier;
}

const searchForClientInRegistry = async (params: any) => {
  const bearerToken = await validateToken();
  const countryCode = params.countryCode;
  const searchIdType = getSearchTypeParam(params.idType);
  const suffix = `/search/${countryCode}/${searchIdType}${encodeURIComponent(
    params.uno
  )}`;
  const url = `${config.dhp.url}${suffix}`;
  console.info("search url: ", url);

  try {
    const data = await fetch(url, {
      method: "GET",
      headers: { Authorization: "Bearer " + bearerToken },
    });
    return await data.json();
  } catch (error) {
    console.error(
      `Error search patient with ${searchIdType}: ${params.uno}`,
      error
    );
  }
};

const searchForClient = async (
  params: any,
  identifierParam: IdentifierParam
) => {
  const bearerToken = await validateToken();

  const urlParam = encodeURIComponent(identifierParam.identifier);
  const suffix = `/search/${params.countryCode}/${identifierParam.idParam}/${urlParam}`;
  const url = config.dhp.url + suffix;
  console.info("DHP registry URL: ", url);

  try {
    const clientRegistrySearchResult = await fetch(url, {
      method: "GET",
      headers: { Authorization: "Bearer " + bearerToken },
    });

    return await clientRegistrySearchResult.json();
  } catch (error) {
    console.error("Error searching for client", error);
  }
};

export default class PatientService {
  constructor() {}

  public async searchPatientByID(params: any) {
    let clientSearchResult = await searchForClientInRegistry(params);
    if (clientSearchResult && clientSearchResult.clientExists) {
      clientSearchResult.client.religion = this.mapToAmrsReligion(
        clientSearchResult.client.religion
      );
      clientSearchResult.client.maritalStatus = this.mapToAmrsMaritalStatus(
        clientSearchResult.client.maritalStatus
      );
      clientSearchResult.client.educationLevel = this.mapToAmrsEducation(
        clientSearchResult.client.educationLevel
      );
    }
    return clientSearchResult;
  }

  public async searchPatient(params: any) {
    console.info("Current patient: ", params.patientUuid);
    const accessToken = await validateToken();
    const httpClient = new config.HTTPInterceptor(
      config.dhp.url || "",
      "",
      "",
      "dhp",
      accessToken
    );

    const identifiers = await getPatientIdentifiers(params.patientUuid);
    const identifierParam: IdentifierParam = getIdentifierParam(identifiers);

    params.amrsNumber = getAMRSNumber(identifiers);

    if (identifierParam && identifierParam.idParam) {
      const result = await searchForClient(params, identifierParam);
      console.info("Does the client exists: ", result.clientExists);

      if (result && result.clientExists) {
        // save UPI(MOH) number for already existing clients
        const createdUPINumber = await this.saveUpiNumber(
          result.client.clientNumber,
          params.patientUuid,
          identifierParam.location,
          params.countryCode
        );
        console.info(
          `successfully saved UPI Number(${createdUPINumber.identifiers}) for patient with UUID ${params.patientUuid}`
        );
      } else {
        // create patient in the client registry
        const payload = await this.constructPayload(
          params.patientUuid,
          identifierParam.location,
          params.countryCode
        );

        return await this.createNewPatient(
          payload,
          params,
          identifierParam.location,
          httpClient
        );
      }
    }
  }

  public async createNewPatient(
    payload: any,
    params: any,
    location: any,
    httpClient: any
  ): Promise<any> {
    /**
     * Patient not found: construct payload and save to client registry.
     */
    httpClient.axios
      .post("", payload)
      .then(async (dhpResponse: any) => {
        console.info(
          `Successfully created client with UPI ${dhpResponse.clientNumber}`
        );
        const persistedToAMRS: any = await this.saveUpiNumber(
          dhpResponse.clientNumber,
          params.patientUuid,
          location,
          params.countryCode
        );
        console.info(`Saved UPI Number & country attribute ${persistedToAMRS}`);
        return;
      })
      .catch((error: any) => {
        /**
         * Determine errors and messages to send to slack monitoring channel
         * When to send client request for retries
         */

        // general error
        const slackErrorObject = {
          message: `Unable to create client with AMRS UUID ${params.patientUuid}`,
          error: `${error.toJSON()}`,
        };

        // Bad request
        if (error.response) {
          slackService.postErrorMessage({
            status_code: `${error.response.status}`,
            status_text: `${error.response.statusText}`,
            message: `Unable to create client with UUID/AMRS_number ${params.patientUuid}/${params.amrsNumber}`,
            response_message: `${JSON.stringify(error.response?.data)}`,
            payload: `${JSON.stringify(payload)}`,
          });
        } else if (error.request) {
          // request was made but no response received
          // let queue for retry
          console.log(error.request);
          slackService.postErrorMessage(slackErrorObject);
          this.queueClientsToRetry({
            payload: payload,
            params: params,
            location: location,
          });
        } else {
          console.log("Error", error.message);
          slackService.postErrorMessage(slackErrorObject);
          this.queueClientsToRetry({
            payload: payload,
            params: params,
            location: location,
          });
        }
        console.error(error.toJSON());
        return;
      });

      return payload;
  }

  private async constructPayload(
    patientUuid: string,
    locationUuid: string,
    countryCode: String
  ) {
    let p: any = await getPatient(patientUuid);
    let mflCode = await getFacilityMfl(locationUuid);
    let identifiers: PatientPayload.PatientIdentifier[] = await getPatientIdentifiers(
      patientUuid
    );
    let allowedIDS = await this.extractAllowedIdentifiers(
      identifiers,
      countryCode
    );

    const payload = {
      clientNumber: "",
      firstName: p.FirstName ? p.FirstName : "",
      middleName: p.MiddleName ? p.MiddleName : "",
      lastName: p.LastName ? p.LastName : "",
      dateOfBirth: p.DateOfBirth ? p.DateOfBirth : "",
      maritalStatus: p.MaritalStatus
        ? this.mapToDhpMaritalStatus(p.MaritalStatus)
        : "",
      gender: p.Gender ? this.mapGender(p.Gender) : "",
      occupation: "",
      religion: p.Religion ? this.mapToDhpReligion(p.Religion) : "",
      educationLevel: p.EducationLevel
        ? this.mapToDhpEducation(p.EducationLevel)
        : "",
      country: p.Country ? this.mapCountry(p.Country) : "",
      countyOfBirth: p.CountryOfBirth ? this.mapCounty(p.CountryOfBirth) : "",
      originFacilityKmflCode: mflCode.mfl_code ? mflCode.mfl_code : "15204",
      isAlive: p.IsAlive,
      isOnART: p.nascopCCCNumber ? true : false,
      nascopCCCNumber: p.nascopCCCNumber ? p.nascopCCCNumber : "",
      residence: {
        county: p.County ? this.mapCounty(p.County) : "",
        subCounty: p.SubCounty ? this.mapSubCounty(p.County, p.SubCounty) : "",
        ward: p.Ward ? this.mapWard(p.County, p.SubCounty, p.Ward) : "",
        village: p.Village ? p.Village : "",
        landmark: p.LandMark ? p.LandMark : "",
        address: p.Address ? p.Address : "",
      },
      identifications: allowedIDS,
      contact: {
        primaryPhone: p.PrimaryPhone ? p.PrimaryPhone : "",
        secondaryPhone: p.SecondaryPhone ? p.SecondaryPhone : "",
        emailAddress: p.EmailAddress ? p.EmailAddress : "",
      },
      nextOfKins: [],
    };

    return payload;
  }

  private async saveUpiNumber(
    upi: string,
    patientUuid: string,
    locationUuid: string,
    countryCode: string
  ) {
    const result = await saveUpiIdentifier(upi, patientUuid, locationUuid);
    const countryAttribute = await saveCountryAttribute(
      patientUuid,
      countryCode
    );

    return {
      identifiers: result,
      attributes: countryAttribute,
    };
  }

  private async extractAllowedIdentifiers(
    identifiers: any,
    countryCode: String
  ) {
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
          countryCode: countryCode,
        });
      }
    });
    return payloadIdentifiers;
  }

  private mapGender(g: string) {
    const gender: any = Gender.filter((r: any) => r.amrs == g);
    return gender[0].value;
  }

  private mapToAmrsReligion(dhpR: string) {
    if (dhpR == null || dhpR.length == 0) {
      return;
    }
    const amrsRel: any = Religion.filter(
      (r: any) => r.value == dhpR.toLocaleLowerCase()
    );
    if (amrsRel.length > 0) {
      return amrsRel[0].amrs;
    }
  }

  private mapToDhpReligion(r: string) {
    if (r == null || r.length == 0) {
      return;
    }
    const religion: any = Religion.filter((a: any) => a.amrs == r);
    if (religion.length > 0) {
      return religion[0].value;
    }
    return "";
  }
  private mapToAmrsEducation(dhpR: string) {
    if (dhpR == null || dhpR.length == 0) {
      return;
    }
    const educationAMrs: any = EducationLevels.filter(
      (r: any) => r.value == dhpR
    );
    if (educationAMrs.length > 0) {
      return educationAMrs[0].amrs;
    }
  }

  private mapToDhpEducation(r: string) {
    if (r == null || r.length == 0) {
      return;
    }
    const education: any = EducationLevels.filter((e: any) => e.amrs == r);
    if (education.length > 0) {
      return education[0].value;
    }
    return "";
  }

  private mapToAmrsMaritalStatus(dhpR: string) {
    if (dhpR == null || dhpR.length == 0) {
      return;
    }
    const statusAmrs: any = MaritalStatus.filter((r: any) => r.value == dhpR);
    if (statusAmrs.length > 0) {
      return statusAmrs[0].amrs;
    }
  }

  private mapToDhpMaritalStatus(r: string) {
    if (r == null || r.length == 0) {
      return;
    }
    const status: any = MaritalStatus.filter((a: any) => a.amrs == r);
    if (status.length > 0) {
      return status[0].value;
    }
    return "";
  }

  private mapCountry(c: string) {
    const country: any = Countries.filter((co) => c == co.label.toLowerCase());
    return country[0].value;
  }

  private mapCounty(c: string) {
    if (c == null || c.length == 0) {
      return;
    }
    const country: any = Counties.filter((co) => c == co.label.toLowerCase());
    return country[0].value;
  }

  private mapSubCounty(a: string, b: string) {
    console.log("djksbcD 1 ", a, b);
    if (b == null || b.length == 0) {
      return;
    }
    const country: any = Counties.filter((co) => {
      return a == co.label.toLowerCase();
    });
    const subCounty: any = country[0].children.filter((co: any) => {
      return b == co.label.toLowerCase();
    });
    return subCounty[0].value;
  }

  private mapWard(a: string, b: string, c: string) {
    if (c == null || c.length == 0) {
      return;
    }
    const country: any = Counties.filter((co) => a == co.label.toLowerCase());
    console.log("country country country ", country[0].children[0]);

    const subCounty: any = country[0].children.filter(
      (co: any) => b == co.label.toLowerCase()
    );
    const ward: any = subCounty[0].children.filter(
      (co: any) => c == co.label.toLowerCase()
    );

    return ward[0].value;
  }

  private mapIDTypes(amrsId: string) {
    const idType = IdentificationTypes.filter((i) => {
      return i.amrs == amrsId;
    });
    return idType[0].value;
  }

  public async retryQueuedClients() {
    console.log("STARTED REDIS CONSUMER");
    const consumer = new Consumer();

    const messageHandler = async (msg: any, cb: any) => {
      const redisPayload = msg.getBody();
      const accessToken = await validateToken();
      const httpClient = new config.HTTPInterceptor(
        config.dhp.url || "",
        "",
        "",
        "dhp",
        accessToken
      );

      /*Consume errors and retry request*/
      const res = JSON.parse(redisPayload);
      this.createNewPatient(
        res.payload,
        res.params,
        res.location,
        httpClient
      ).then((s) => console.log("PATIENT UPDATING FROM REDIS"));
      cb();
    };

    consumer.consume(
      "verb_queue_test",
      false,
      messageHandler,
      (err, isRunning) => {
        if (err) console.error(err);
        // the message handler will be started only if the consumer is running
        else
          console.log(
            `Message handler has been registered. Running status: ${isRunning}`
          ); // isRunning === false
      }
    );

    consumer.run();
  }

  public async queueClientsToRetry(patientPayload: any) {
    const producer = new Producer();
    const message = new Message();
    message
      .setBody(JSON.stringify(patientPayload))
      .setTTL(3600000)
      .setQueue("verb_queue_test");
    producer.produce(message, (err) => {
      if (err) console.log(err);
      else {
        const msgId = message.getId();
        console.log("Successfully produced. Message ID is ", msgId);
      }
    });
    producer.shutdown();
  }
}
