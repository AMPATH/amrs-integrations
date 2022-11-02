import config from "@amrs-integrations/core";
import { validateToken } from "../helpers/auth";
import { saveUpiIdentifier, getPatientIdentifiers } from "../helpers/patient";
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
import fetch from 'node-fetch';

export default class PatientService {
  constructor() { }
  public async searchPatientByID(params: any) {
    let accessToken = await validateToken();

    const searchIdType = params.idType;
    let idParam = "national-id";

    switch (searchIdType) {
      case "58a47054-1359-11df-a1f1-0026b9348838":
        idParam = "national-id";
        break;
      case "7924e13b-131a-4da8-8efa-e294184a1b0d":
        idParam = "birth-certificate";
        break;
      case "ced014a1-068a-4a13-b6b3-17412f754af2":
        idParam = "passport";
        break;
    }
    const urlParam = encodeURIComponent(params.uno)

    const url = `/search/${idParam}/${urlParam}`;
    let dhpResponse: any;
    await fetch(config.dhp.url + url, {
      method: 'get',
      headers: { 'Authorization': 'Bearer ' + accessToken }
    }).then(res => res.json())
      .then((json: PatientPayload.ClientObject) => {
        dhpResponse = json
      })
      .catch((r: any) => console.log(r));
    if (dhpResponse.clientExists) {
      console.log("dhpResponse ", dhpResponse);
      dhpResponse.client.religion = this.mapToAmrsReligion(
        dhpResponse.client.religion
      );
      dhpResponse.client.maritalStatus = this.mapToAmrsMaritalStatus(
        dhpResponse.client.maritalStatus
      );
      dhpResponse.client.educationLevel = this.mapToAmrsEducation(
        dhpResponse.client.educationLevel
      );
    }
    return dhpResponse;
  }

  public async searchPatient(params: any) {
    let accessToken = await validateToken();
    let httpClient = new config.HTTPInterceptor(
      config.dhp.url || "",
      "",
      "",
      "dhp",
      accessToken
    );

    let identifiers = await getPatientIdentifiers(params.patientUuid);
    let universalId = identifiers.results.filter(
      (id: any) =>
        id.identifierType.uuid == "58a4732e-1359-11df-a1f1-0026b9348838"
    );
    console.log("CURRENT PATIENT ", params.patientUuid);
    let idParam = "";
    let identifier = "";
    let location = "";
    identifiers.results.forEach((id: any) => {
      if (id.identifierType.uuid == "58a47054-1359-11df-a1f1-0026b9348838") {
        idParam = "national-id";
        identifier = id.identifier;
        location = id.location.uuid;
        return;
      } else if (
        id.identifierType.uuid == "7924e13b-131a-4da8-8efa-e294184a1b0d"
      ) {
        idParam = "birth-certificate";
        identifier = id.identifier;
        location = id.location.uuid;
        return;
      } else if (
        id.identifierType.uuid == "ced014a1-068a-4a13-b6b3-17412f754af2"
      ) {
        idParam = "passport";
        identifier = id.identifier;
        location = id.location.uuid;
        return;
      }
    });

    console.log(
      "ID val ",
      idParam,
      "ID type ",
      identifier,
      "ID location ",
      location
    );

    if (idParam.length != 0) {

      const urlParam = encodeURIComponent(identifier)

      const url = `/search/${idParam}/${urlParam}`;
      let dhpResponse: any;
      await fetch(config.dhp.url + url, {
        method: 'get',
        headers: { 'Authorization': 'Bearer ' + accessToken }
      }).then(res => res.json())
        .then((json: PatientPayload.ClientObject) => {
          dhpResponse = json
        })
        .catch((r: any) => console.log(r));

      console.log("Does client exist in registry ", dhpResponse.clientExists);
      if (dhpResponse.clientExists) {
        let savedUpi = await this.saveUpiNumber(
          dhpResponse.client.clientNumber,
          params.patientUuid,
          location
        );
        console.log("Saved UPI, Existing Patient", savedUpi.identifier);
        return;
      }
      params.amrsNumber = universalId[0]?.identifier;
      let payload = await this.constructPayload(params.patientUuid, location);

      return this.createNewPatient(payload, params, location, httpClient);
    }
  }

  public async createNewPatient(
    payload: any,
    params: any,
    location: any,
    httpClient: any
  ) {
    /** Patient not found: Construct payload and save to Registry*/
    const slackService = new SlackService();

    httpClient.axios
      .post("", payload)
      .then(async (dhpResponse: any) => {
        let savedUpi: any = await this.saveUpiNumber(
          dhpResponse.clientNumber,
          params.patientUuid,
          location
        );
        console.log("Created successfully, assigned UPI", savedUpi.identifier);
      })
      .catch((err: any) => {
        const slackPayload = {
          patientIdentifier: params.amrsNumber
            ? params.amrsNumber
            : params.patientUuid,
          errors: "",
        };

        if (err.response.data.errors !== undefined) {
          /**Send bad request error to slack, error 400 */
          slackPayload.errors = JSON.stringify(err.response.data.errors);
        } else {
          /**Queue patient in Redis, error 500 */
          slackPayload.errors = "Verification retried";
          const redisBody = {
            payload: payload,
            params: params,
            location: location,
          };
          this.queueClientsToRetry(redisBody);
        }
        slackService.postErrorMessage(slackPayload);
      });

    return payload;
  }

  private async constructPayload(patientUuid: string, locationUuid: string) {
    let p: any = await getPatient(patientUuid);
    let mflCode = await getFacilityMfl(locationUuid);
    let identifiers: PatientPayload.PatientIdentifier[] = await getPatientIdentifiers(
      patientUuid
    );
    let allowedIDS = await this.extractAllowedIdentifiers(identifiers);

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
      nascopCCCNumber: p.nascopCCCNumber ? p.nascopCCCNumber : "",
      residence: {
        county: p.County ? this.mapCounty(p.County) : "",
        subCounty: p.SubCounty ? p.SubCounty : "",
        ward: p.Ward ? p.Ward : "",
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
    locationUuid: string
  ) {
    const result = await saveUpiIdentifier(upi, patientUuid, locationUuid);
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

  private mapIDTypes(amrsId: string) {
    const idType = IdentificationTypes.filter((i) => (i.amrs = amrsId));
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

    consumer.consume("verb_queue", false, messageHandler, (err, isRunning) => {
      if (err) console.error(err);
      // the message handler will be started only if the consumer is running
      else
        console.log(
          `Message handler has been registered. Running status: ${isRunning}`
        ); // isRunning === false
    });

    consumer.run();
  }
  public async queueClientsToRetry(patientPayload: any) {
    const producer = new Producer();
    const message = new Message();
    message
      .setBody(JSON.stringify(patientPayload))
      .setTTL(3600000)
      .setQueue("verb_queue");
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
