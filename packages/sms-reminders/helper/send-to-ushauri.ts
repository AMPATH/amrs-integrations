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

const ushauriAppiCall = async (args: any) => {
    let httpClient = new config.HTTPInterceptor(
        config.openhim.url || "",
        config.openhim.auth.username || '',
        config.openhim.auth.password || '',
        ""
    );

    let response: any = await httpClient.axios(
        '/IL/registration/test',
        {
            method: "post",
            data: args.payload,
        }
    );

    return response;
}
export const sendRegistrationToUshauri = async (params: any) => {

    let paylod: any = await getRegistration(params);
    let args = {payload: paylod}
    let response = ushauriAppiCall(args);

    return response;
}

export const sendAppointmentToUshauri = async (params: any) => {
    let payload: any = await getAppointment(params.smsParams);
    let carrier = retrievePhoneCarrier(params.natnum);
    let isSaf: boolean = isSafaricomNumber(carrier);

    if (isSaf === true)
    {
        //TODO: set the payload CONSENT_FOR_REMINDER to 'N' To make advanta happy
    }

    let args = { payload: payload };
    let response = ushauriAppiCall(args);

    return response;
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