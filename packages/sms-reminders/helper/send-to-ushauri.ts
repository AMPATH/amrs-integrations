import config from "@amrs-integrations/core";
import { isSafaricomNumber, retrievePhoneCarrier } from "./get-carrier-prefix";
import { getRegistration } from "./get-registration";
import { getAppointment } from "./get-appointment";
import { queryDB } from "./extract-payload-record";

let CM = config.ConnectionManager.getInstance();

const checkIfInUshauriDb = async (person_id: number ) => {
    
    let amrsCON = await CM.getConnectionAmrs();
    const sql = `select * from etl.ushauri where person_id="${person_id}"`;
    let result: any = await CM.query(sql, amrsCON);

    await CM.releaseConnections(amrsCON);

    return result;
}
export const deleteUshauriRecord = async (person_id: number) => {
    let amrsCON = await CM.getConnectionAmrs();
    const sql = `delete from etl.ushauri where etl.ushauri.person_id= "${person_id}"`;
    let result: any = await CM.query(sql, amrsCON);

    await CM.releaseConnections(amrsCON);

    return result;
}
const registerToUshauriDB = async (person_id: number) => {
    let amrsCON = await CM.getConnectionAmrs();
    const sql = `insert into etl.ushauri(person_id) values("${person_id}")`;
    let result: any = await CM.query(sql, amrsCON);

    await CM.releaseConnections(amrsCON);

    return result;
}

const logUshauriResponse = async (rows: any, response: any) => {
    console.log(response.success)
    let amrsCON = await CM.getConnectionAmrs();
    let sql = `
    INSERT INTO etl.ushauri_responses(nupi, success_status, message_created_datetime, appointment_date, response_msg)
    VALUES(
        "${rows[0].IPI_IDENTIFIER_TYPE_2_ID}",
        "${response.success === true ? 1 : 0}",
        "${rows[0].MESSAGE_DATETIME}",
        "${response.response.data.appntmnt_date}",
        "${response.response.msg}"
    )
    `;
    let result: any = await CM.query(sql, amrsCON);
    await CM.releaseConnections(amrsCON);

    return result;
}

/* Make a call to the ushauri service via OpenHIM */
const ushauriApiCall = async (args: any) => {
    let httpClient = new config.HTTPInterceptor(
        config.openhim.url || "",
        config.openhim.auth.username || '',
        config.openhim.auth.password || '',
        ""
    );

    let response = await httpClient.axios(
        '/IL/registration',
        {
            method: "post",
            data: args,
        }
    )
    .then((res: any)=> {
        return res;
    })
    .catch((err: any) => {
        return err;
    })

    return response;
}
export const sendRegistrationToUshauri = async (params: any, rows: any[]) => {
    let payload: any = await getRegistration(params, rows);

    if (payload == null)
        return null;
    let response = await ushauriApiCall(JSON.stringify(payload));

    return response;
}

export const sendAppointmentToUshauri = async (params: any, rows: any[]) => {

    let payload = await getAppointment(params.smsParams, rows);

    if (payload == null) return null;

    let carrier = retrievePhoneCarrier(params.natnum);
    let isSaf: boolean = isSafaricomNumber(carrier);
    if (isSaf == false)
    {
        payload.APPOINTMENT_INFORMATION[0].CONSENT_FOR_REMINDER = 'Y';
    }

    let response = await ushauriApiCall(JSON.stringify(payload));

    return response;
}

export const sendToUshauri = async (params:any) => {
    const rows = await queryDB(params.smsParams.person_id);
    let result = await checkIfInUshauriDb(params.smsParams.person_id);
    let response: any;

    if (result.length == 0)
    {
        response = await sendRegistrationToUshauri(params.smsParams, rows);
        if((response != null || response != undefined) || response?.success == true)
        {
            result = await registerToUshauriDB(params.smsParams.person_id);
        }
        else
        {
            await deleteUshauriRecord(params.smsParams.person_id)
            return;
        }
    }
    let Appointmentresponse = await sendAppointmentToUshauri(params, rows)
    await logUshauriResponse(rows, Appointmentresponse)

    return Appointmentresponse;
}