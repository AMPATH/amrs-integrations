import config from "@amrs-integrations/core";
import dictionary from "../templates/sms_dictionary.json";
import qs from "qs";
import { Patient, SMSResponse } from "../models/patient";
import moment from "moment";
import { isValidPhoneNumber, parsePhoneNumber } from "libphonenumber-js";
import {
  checkNumber,
  fetchClientsWithPendingDeliveryStatus,
  saveNumber,
  saveOrUpdateSMSResponse,
} from "../models/queries";
import { sendToUshauri } from "../helper/send-to-ushauri";

export async function SendSMS(params: any) {
  let smsParams: Patient = params;
  // TODO: Check the telco used for the provider then pick approapriate shortcode
  if (
    smsParams.phone_number &&
    isValidPhoneNumber(smsParams.phone_number, "KE")
  ) {
    const phoneNumber = parsePhoneNumber(smsParams.phone_number, "KE");
    let numberExist: any[] = await checkNumber(phoneNumber.number);
    if (
      (smsParams.messageType === "welcome" &&
        numberExist.length > 0 &&
        numberExist[0].status === "active") ||
      (smsParams.messageType === "optout" &&
        numberExist.length > 0 &&
        numberExist[0].status === "optedout") ||
      (smsParams.messageType === "optout" && numberExist.length! > 0)
    ) {
      return;
    } else if (
      (smsParams.messageType === "optout" &&
        numberExist.length > 0 &&
        numberExist[0].status === "active") ||
      (smsParams.messageType === "welcome" && numberExist.length == 0) ||
      (smsParams.messageType === "welcome" &&
        numberExist.length > 0 &&
        numberExist[0].status === "optedout")
    ) {
      let status = smsParams.messageType === "optout" ? "optedout" : "active";
      await saveNumber(phoneNumber.number, status, numberExist.length > 0);
    }
    let appointmentDate = moment(smsParams.rtc_date).format("YYYY-MM-DD");
    let days = moment().diff(moment(appointmentDate), "days");
    if (Math.abs(days) >= 14) {
      const args = { natnum: phoneNumber.nationalNumber, smsParams };
      let response = await sendToUshauri(args);
    } else {
      let sms = "";
      let personName = smsParams.person_name;
      if (smsParams.language === "english") {
        sms =
          dictionary.templates.find(
            (x: { type: string }) => x.type === smsParams.messageType
          )?.english || "";
      } else {
        sms =
          dictionary.templates.find(
            (x: { type: string }) => x.type === smsParams.messageType
          )?.kiswahili || "";
      }
      let httpClient = new config.HTTPInterceptor(
        config.sms.url || "",
        "",
        "",
        "sms"
      );

      if (sms !== "") {
        let smsContent = sms
          .replace("$personName$", personName)
          .replace("$rtc_date$", appointmentDate);
        let sendSMSResponse: any = await httpClient.axios("/sms", {
          method: "post",
          data: qs.stringify({
            shortcode: config.sms.shortCode,
            partnerID: config.sms.partnerID,
            apikey: config.sms.apiKey,
            mobile: phoneNumber.number,
            timeToSend: smsParams.timeToSend,
            message: smsContent,
          }),
        });
        //Save the message response
        let date_created = moment().format("YYYY-MM-DD hh:mm:ss");
        let smsResponse: SMSResponse = {
          person_id: smsParams.person_id,
          phone_number: phoneNumber.number,
          message_type: smsParams.messageType,
          message_id: sendSMSResponse.responses[0]["messageid"],
          date_created: date_created,
          delivery_status: "pending",
        };
        await saveOrUpdateSMSResponse(smsResponse, "create");
        return smsResponse;
      } else {
        console.log("Invalid phone number");
      }
    }
  }
}

export async function UpdateDelivery() {
  //Retrive all clients with pending status
  let messageID: [] = await fetchClientsWithPendingDeliveryStatus();
  //update status
  let httpClient = new config.HTTPInterceptor(
    "https://quicksms.advantasms.com/api",
    "",
    "",
    "sms"
  );
  for (let index = 0; index < messageID.length; index++) {
    const element: any = messageID[index];

    console.log(element.message_id);
    let sendSMSResponse: any = await httpClient.axios("/services/getdlr/", {
      method: "get",
      data: qs.stringify({
        messageID: element.message_id,
        partnerID: config.sms.partnerID,
        apikey: config.sms.apiKey,
      }),
    });

    console.log(sendSMSResponse["delivery-description"], sendSMSResponse);
    let deliveryReport: SMSResponse = {
      person_id: 0,
      phone_number: "",
      message_type: "",
      message_id: element.message_id,
      date_created: "",
      delivery_status: sendSMSResponse["delivery-description"],
    };
    await saveOrUpdateSMSResponse(deliveryReport, "update");
  }
}
