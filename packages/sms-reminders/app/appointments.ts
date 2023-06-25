import moment from "moment";
import { Consumer, Message, Producer } from "redis-smq";
import { Patient } from "../models/patient";
import {
  dailyAppointmentsquery,
  getConsentedAndOptedoutClients,
  getHonoredAppointments,
  getMissedAppointments,
} from "../models/queries";
import { SendSMS } from "./sms";
import config from "@amrs-integrations/core";
import qs from "qs";
export async function RetrieveAppointments(
  daysBeforeRTC: string,
  location: string,
  messageType: string
) {
  let appointmentDate = moment()
    .add(daysBeforeRTC, "days")
    .format("YYYY-MM-DD");
  if (messageType === "welcome" || messageType === "optout") {
    //Retrieve clients who have consented and never received a welcome message in the last 5 minutes;
    let last5 = moment().subtract(5, "minutes").format("YYYY-MM-DD HH:mm:ss");
    let clients = await getConsentedAndOptedoutClients(last5);
    await QueueAppointments(clients, messageType);
  } else if (messageType === "congratulations") {
    //Retrieve clients who have honored appointments in the last hour;
    let lastHour = moment().subtract(1, "hour").format("YYYY-MM-DD HH:mm:ss");
    let honouredAppointments = await getHonoredAppointments(
      moment().format("YYYY-MM-DD"),
      lastHour
    );
    await QueueAppointments(honouredAppointments, messageType);
  } else if (messageType === "missed") {
    let yesterday = moment().subtract(1, "day").format("YYYY-MM-DD");
    let missedAppointments = await getMissedAppointments(yesterday);
    await QueueAppointments(missedAppointments, messageType);
  } else {
    let appointments = await dailyAppointmentsquery(appointmentDate);
    await QueueAppointments(appointments, messageType);
  }
}

export async function QueueAppointments(
  patients: Patient[],
  messageType: string
) {
  let count = 0;
  if(patients.length != 0){
  const producer = new Producer();
  patients.forEach(async (element) => {
    const message = new Message();
    // get consent
    let consent = await GetPatientConsent(element.uuid);
    if (consent[0] !== "") {
      count++;
      //|| messageType === "optout" TODO
      element.timeToSend =
        messageType === "optout" || "welcome" || "sameday"
          ? ""
          : moment().format("YYYY-MM-DD") +
            " " +
            moment(consent[0]).format("HH:mm");
      element.language = consent[1];
      element.messageType = messageType;
      message
        .setBody(JSON.stringify(element))
        .setTTL(3600000) // in millis
        .setQueue("appointments_queue");

      producer.produce(message, (err) => {
        if (err) console.log(err);
        else {
          const msgId = message.getId(); // string
          console.log("Successfully produced. Message ID is ", msgId,element.person_name,consent);
        }
      });
    } else {
      count++
      console.log(element.person_name + " not consented ",patients.length,count);
    }
    console.log(element.person_name + " not consented ",patients.length,count);
     // if all appointments were queued successfuly, shutdown producer and exit with code 0
     if (count == patients.length) {
      producer.shutdown(process.exit(0));
    }
  });
}else{
  process.exit(0);
}
}

export async function SendNotifications() {
  const consumer = new Consumer();

  const messageHandler = async (
    msg: { getBody: () => any },
    cb: () => void
  ) => {
    const payload: Patient = msg.getBody();
    // send sms
    await SendSMS(payload);
    //check response for success or error. if error
    cb(); // acknowledging the message
  };

  consumer.consume(
    "appointments_queue",
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
export async function GetPatientConsent(patientUUID: string) {
  let httpClient = new config.HTTPInterceptor(
    config.sms.url || "",
    config.amrsUsername || "",
    config.amrsPassword || "",
    "amrs"
  );
  let consentedTime = "";
  let consentedLanguage = "";
  let consentResult="";
  let consent: any = await httpClient.axios(
    "/ws/rest/v1/obs?" +
      qs.stringify({
        patient: patientUUID,
        concept: "8873d881-6ad3-46e6-a558-b97d51d15e01",
        v: "custom:(value,concept:(uuid,uuid,name:(display)))",
        limit: 1,
      }),
    {
      method: "get",
    }
  );
  if (
    consent.results.length > 0 &&
    consent.results[0]?.value?.display === "YES"
  ) {
    let smsTimeandLanguage = await httpClient.axios(
      "/ws/rest/v1/obs?" +
        qs.stringify({
          patient: patientUUID,
          concepts:
            "4e1a9d59-3d06-47eb-82a7-30410db249e4,a89e54e8-1350-11df-a1f1-0026b9348838",
          v: "custom:(value,concept:(uuid,uuid,name:(display)))",
        }),
      {
        method: "get",
      }
    );
    consentedTime = smsTimeandLanguage.results.find(
      (x: { concept: { uuid: string } }) =>
        x.concept.uuid === "4e1a9d59-3d06-47eb-82a7-30410db249e4"
    )?.value;
    consentedLanguage =
      smsTimeandLanguage.results.find(
        (x: { concept: { uuid: string } }) =>
          x.concept.uuid === "a89e54e8-1350-11df-a1f1-0026b9348838"
      )?.value?.display === "SWAHILI"
        ? "kiswahili"
        : "english";
  }
  return [consentedTime,consentedLanguage];
}
