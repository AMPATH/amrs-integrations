import config from "@amrs-integrations/core";
import { isSafaricomNumber, retrievePhoneCarrier } from "./get-carrier-prefix";
import { getRegistration } from "./get-registration";
import { getAppointment } from "./get-appointment";

let CM = config.ConnectionManager.getInstance();

const checkIfInUshauriDb = async (person_id: number ) => {
    
    let amrsCON = await CM.getConnectionAmrs();
    const sql = `select * from ushauri.registration_log where ="${person_id}"`;
    let result: any = await CM.query(sql, amrsCON);
    await CM.releaseConnections(amrsCON);

    return result;
}

export const sendRegistrationToUshauri = async (params: any) => {

    let paylod: any = await getRegistration(params);
    let httpClient = new config.HTTPInterceptor(
        "https://openhimapi.kenyahmis.org/rest/api" || "",
        "test@gmail.com",
        "Test@gmail.com",
        "dGVzdEBnbWFpbC5jb206VGVzdEAxMjM="
    );

    let sendToOpenHIMRes: any = await httpClient.axios(
        "/IL/registration/test",
        {
            method: "post",
            data: paylod,
        }
    );

    return sendToOpenHIMRes;
}

export const sendAppointmentToUshauri = async (params: any) => {
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
        "dGVzdEBnbWFpbC5jb206VGVzdEAxMjM="
    );

    let sendToOpenHIMRes: any = await httpClient.axios(
        "/IL/registration/test",
        {
            method: "post",
            data: payload,
        }
    );

    return sendToOpenHIMRes;
}

export const sendToUshauri =async (params:any) => {

    let result = checkIfInUshauriDb(params.person_id);
    let response: any;

    if (result === null)
    {
        response = await sendRegistrationToUshauri(params);
    }
    response = await sendAppointmentToUshauri(params);
}