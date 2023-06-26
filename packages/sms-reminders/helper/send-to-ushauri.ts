import config from "@amrs-integrations/core";
import { isSafaricomNumber, retrievePhoneCarrier } from "./get-carrier-prefix";
import { getRegistration } from "./get-registration";
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
    let payload: any = await getAppointment(params.smsParams);
    let carrier = retrievePhoneCarrier(params.natnum);
    let isSaf: boolean = isSafaricomNumber(carrier);

    if (isSaf === true)
    {
        //TODO: set the payload CONSENT_FOR_REMINDER to 'N' To make advanta happy
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
            data: payload,
        }
    );

    console.log(sendToOpenHIM);
}
