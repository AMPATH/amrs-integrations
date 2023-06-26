import config from "@amrs-integrations/core";
import { isSafaricomNumber, retrievePhoneCarrier } from "./get-carrier-prefix";
import { getRegistration } from "./get-registration";
import { Patient } from "../models/patient";
import { getAppointment } from "./get-appointment";

export const sendRegistrationToUshauri = async (params: any) => {

    let paylod: any = await getRegistration(params);
    let httpClient = new config.HTTPInterceptor(
        "https://openhimapi.kenyahmis.org/rest/api" || "",
        "test@gmail.com",
        "Test@gmail.com",
        "sms"
    );

    let sendToOpenHIM: any = await httpClient.axios(
        "/IL/registration/test",
        {
            method: "post",
            data: paylod,
        }
    );
    console.log(sendToOpenHIM);
}
export const sendAppointmentToUshauri =async (params: any) => {
    let paylod: any = await getAppointment(params.smsParams);
    let carrier = retrievePhoneCarrier(params.natnum);
    let isSaf: boolean = isSafaricomNumber(carrier);

    if (isSaf === false)
    {

    }
    let httpClient = new config.HTTPInterceptor(
        "https://openhimapi.kenyahmis.org/rest/api" || "",
        "test@gmail.com",
        "Test@gmail.com",
        "sms"
    );

    let sendToOpenHIM: any = await httpClient.axios(
        "/IL/registration/test",
        {
            method: "post",
            data: paylod,
        }
    );
    
    console.log(sendToOpenHIM);
}
