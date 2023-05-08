import config from "@amrs-integrations/core";
import { Patient, SMSResponse } from "./patient";
let CM = config.ConnectionManager.getInstance();

export async function dailyAppointmentsquery(appointmentDate: string) {
  let amrsCON = await CM.getConnectionAmrs();
  let sql =
    "SELECT t1.uuid,t2.person_id AS `person_id`,t2.scheduled_date as rtc_date, GROUP_CONCAT(DISTINCT contacts.value SEPARATOR ', ') AS `phone_number`, person_name.given_name AS `person_name` FROM etl.flat_appointment `t2` FORCE INDEX (location_med_pickup_rtc_date) LEFT JOIN ( SELECT fa.encounter_id AS `encounter_id`, MAX(fa.encounter_id) AS `max_encounter_id`, person_id AS `person_id` FROM etl.flat_appointment `fa` FORCE INDEX (location_med_pickup_rtc_date) WHERE (date(fa.scheduled_date) >= '" +
    appointmentDate +
    "') AND (date(fa.scheduled_date) <= '" +
    appointmentDate +
    "') AND (fa.is_clinical = 1 OR fa.encounter_type = 186) AND (fa.encounter_type NOT IN (21 , 99999)) GROUP BY person_id) `latest_encounter` ON (latest_encounter.person_id = t2.person_id) LEFT JOIN etl.flat_appointment `t3` ON (t3.person_id = t2.person_id AND t3.encounter_id = latest_encounter.max_encounter_id) LEFT JOIN etl.flat_appointment `death_reporting` ON (death_reporting.person_id = t2.person_id AND death_reporting.encounter_type IN (31) AND death_reporting.encounter_datetime >= t2.encounter_datetime) LEFT JOIN etl.flat_hiv_summary_v15b `fhs` ON (t2.encounter_id = fhs.encounter_id) INNER JOIN amrs.person `t1` ON (t2.person_id = t1.person_id) LEFT JOIN amrs.person_name `person_name` ON (t1.person_id = person_name.person_id AND (person_name.voided IS NULL || person_name.voided = 0) AND person_name.preferred = 1) LEFT JOIN amrs.person_attribute `contacts` ON (t1.person_id = contacts.person_id AND (contacts.voided IS NULL || contacts.voided = 0) AND contacts.person_attribute_type_id IN (10)) LEFT JOIN amrs.person_address `pa` ON (t1.person_id = pa.person_id) WHERE contacts.value IS NOT NULL and (date(t2.scheduled_date) >= '" +
    appointmentDate +
    "') AND (date(t2.scheduled_date) <= '" +
    appointmentDate +
    "') AND fhs.next_clinical_datetime_hiv is null AND (t3.program_id IN (1, 4, 2, 11, 10, 19, 30, 9, 8, 3, 20, 25, 27, 28, 29, 31) OR t3.program_id IS NULL) AND (t2.encounter_type NOT IN (21, 99999)) AND (((t2.next_encounter_type <> 116 OR t2.next_encounter_type IS NULL ) OR t2.scheduled_date >= t2.next_encounter_datetime)) AND (t2.is_clinical = 1) AND (t2.is_clinical = 1) AND (fhs.transfer_out_location_id IS NULL OR fhs.transfer_out_location_id <> 9999) AND ((death_reporting.encounter_datetime IS NULL) OR (DATE(t2.scheduled_date) < DATE(death_reporting.encounter_datetime))) AND (1 = (IF(DATE_FORMAT(t2.scheduled_date, '%Y-%m-%d') = '" +
    appointmentDate +
    "', 1, NULL))) GROUP BY t1.person_id";
  console.log("Query", sql);
  let result: Patient[] = await CM.query(sql, amrsCON);
  await CM.releaseConnections(amrsCON)
  return result;
}
export async function getConsentedAndOptedoutClients(
  encounterDateTime: string
) {
  // TODO
  let amrsCON = await CM.getConnectionAmrs();
  let sql = `SELECT 
                t1.uuid,
                t1.person_id AS person_id,
              contacts.value
                  AS phone_number,
                person_name.given_name AS person_name
              FROM
                amrs.encounter t2
                    LEFT JOIN
                etl.flat_appointment death_reporting ON (death_reporting.person_id = t2.patient_id
                    AND death_reporting.encounter_type IN (31)
                    AND death_reporting.encounter_datetime >= t2.encounter_datetime)
                    INNER JOIN
                amrs.person t1 ON (t2.patient_id = t1.person_id)
                    LEFT JOIN
                amrs.person_name person_name ON (t1.person_id = person_name.person_id
                    AND (person_name.voided IS NULL
                    || person_name.voided = 0)
                    AND person_name.preferred = 1)
                    LEFT JOIN
                amrs.person_attribute contacts ON (t1.person_id = contacts.person_id
                    AND (contacts.voided IS NULL
                    || contacts.voided = 0)
                    AND contacts.person_attribute_type_id IN (10))
              WHERE
                contacts.value IS NOT NULL
                    AND (t2.encounter_type IN (213)) and t2.encounter_datetime > "${encounterDateTime}"
                    AND (death_reporting.encounter_datetime IS NULL)
              GROUP BY t1.person_id;`;
              console.log(sql);
  let result: Patient[] = await CM.query(sql, amrsCON);
  await CM.releaseConnections(amrsCON)
  return result;
}

export async function getHonoredAppointments(
  currentDate: string,
  encounterDatetime: string
) {
  let amrsCON = await CM.getConnectionAmrs();
  let sql = `SELECT 
              t1.uuid,
              t2.person_id AS person_id,
              person_name.given_name AS person_name,
              contacts.value AS phone_number,
              fh.rtc_date
            FROM
              etl.flat_appointment t2
                  LEFT JOIN
              amrs.program pr ON (pr.program_id = t2.program_id)
                  INNER JOIN
              amrs.person t1 ON (t2.person_id = t1.person_id)
                  LEFT JOIN
              amrs.person_name person_name ON (t1.person_id = person_name.person_id
                  AND (person_name.voided IS NULL
                  || person_name.voided = 0)
                  AND person_name.preferred = 1)
                  LEFT JOIN
              amrs.person_attribute contacts ON (t1.person_id = contacts.person_id
                  AND (contacts.voided IS NULL
                  || contacts.voided = 0)
                  AND contacts.person_attribute_type_id IN (10))
                  LEFT JOIN
              etl.flat_hiv_summary_v15b fh ON (t1.person_id = fh.person_id
                  AND fh.next_clinical_location_id IS NULL
                  AND fh.encounter_type NOT IN (99999))
                  LEFT JOIN
              amrs.encounter_type et ON (fh.encounter_type = et.encounter_type_id)
                  LEFT JOIN
              amrs.person_address pa ON (t1.person_id = pa.person_id)
                  LEFT JOIN
              amrs.visit_type vt ON (t2.visit_type_id = vt.visit_type_id)
            WHERE
              (t2.encounter_datetime >= '${encounterDatetime}')
                  AND (t2.program_id IN (1 , 4,
                  2,
                  11,
                  10,
                  19,
                  30,
                  9,
                  8,
                  3,
                  20,
                  25,
                  27,
                  28,
                  29,
                  31,
                  51)
                  OR t2.program_id IS NULL)
                  AND (t2.encounter_type NOT IN (21 , 99999))
                  AND (t2.is_clinical = 1)
                  AND (1 = (IF(DATE_FORMAT(t2.encounter_datetime, '%Y-%m-%d') = '${currentDate}',
                  1,
                  NULL)))
            GROUP BY t1.person_id`;
            console.log(sql)
  let result: Patient[] = await CM.query(sql, amrsCON);
  await CM.releaseConnections(amrsCON)
  return result;
}

export async function getMissedAppointments(yesterday: string) {
  let amrsCON = await CM.getConnectionAmrs();
  let sql = `SELECT 
              t1.uuid AS uuid,
                t2.person_id AS person_id,
                t2.encounter_type AS encounter_type,
              person_name.given_name AS person_name,
                contacts.value AS phone_number
            FROM
                etl.flat_appointment t2
                    LEFT JOIN
                etl.flat_appointment t8 ON (t2.person_id = t8.person_id
                    AND t8.encounter_type = 116
                    AND t2.encounter_datetime < t8.encounter_datetime)
                    LEFT JOIN
                etl.flat_hiv_summary_v15b t9 ON (t9.encounter_id = t2.encounter_id)
                    INNER JOIN
                amrs.person t10 ON (t2.person_id = t10.person_id)
                    INNER JOIN
                amrs.visit t20 ON (t2.visit_id = t20.visit_id)
                    INNER JOIN
                etl.program_visit_map t21 ON (t21.visit_type_id = t20.visit_type_id)
                    LEFT JOIN
                (SELECT 
                    t2.person_id AS person_id,
                        t2.is_clinical AS is_clinical,
                        scheduled_date AS latest_rtc_date,
                        department_id AS department_id,
                        next_clinical_encounter_datetime AS next_clinical_encounter_datetime,
                        program_id AS program_id
                FROM
                    etl.flat_appointment t2
                WHERE
                    (t2.is_clinical = 1)
                        AND (t2.next_clinical_encounter_datetime IS NULL)
                GROUP BY person_id) t7 ON (t2.person_id = t7.person_id)
                    LEFT JOIN
                amrs.program pr ON (pr.program_id = t2.program_id)
                    INNER JOIN
                amrs.person t1 ON (t2.person_id = t1.person_id)
                    LEFT JOIN
                amrs.person_name person_name ON (t1.person_id = person_name.person_id
                    AND (person_name.voided IS NULL
                    || person_name.voided = 0)
                    AND person_name.preferred = 1)
                    LEFT JOIN
                amrs.person_attribute contacts ON (t1.person_id = contacts.person_id
                    AND (contacts.voided IS NULL
                    || contacts.voided = 0)
                    AND contacts.person_attribute_type_id IN (10))
                    LEFT JOIN
                etl.flat_hiv_summary_v15b fh ON (t1.person_id = fh.person_id
                    AND fh.next_clinical_location_id IS NULL
                    AND fh.encounter_type NOT IN (99999 , 21))
                  
            WHERE
                (DATE(t2.scheduled_date) >= '${yesterday}')
                    AND (DATE(t2.scheduled_date) <= '${yesterday}')
                    AND (t21.program_type_id IN (1 , 4,
                    2,
                    11,
                    10,
                    19,
                    30,
                    9,
                    8,
                    3,
                    20,
                    25,
                    27,
                    28,
                    29,
                    31,
                    51)
                    OR t7.program_id IS NULL)
                    AND (t2.next_program_clinical_datetime IS NULL)
                    AND (t2.encounter_type != 116)
                    AND (t2.next_clinical_encounter_datetime IS NULL)
                    AND (t7.is_clinical = 1)
                    AND (DATE(t2.scheduled_date) < DATE(NOW()))
                    AND (DATE(t2.scheduled_date) = DATE(t7.latest_rtc_date))
                    AND (t10.dead = 0)
                    AND (t9.transfer_out_location_id IS NULL
                    || t9.transfer_out_location_id <> 9999)
                    AND (t9.out_of_care IS NULL)
                    AND (1 = (IF((DATE(t2.scheduled_date) = DATE('${yesterday}'))
                        AND (t2.scheduled_date = t7.latest_rtc_date)
                        AND t2.next_program_clinical_datetime IS NULL,
                    1,
                    NULL)))
            GROUP BY t1.person_id`;
            console.log(sql);
  let result: Patient[] = await CM.query(sql, amrsCON);
  await CM.releaseConnections(amrsCON)
  return result;
}

export async function saveNumber(
  phoneNumber: string,
  status: string,
  existingPhone: boolean
) {
  console.log('niko area', status, existingPhone)
  let amrsCON = await CM.getConnectionAmrs();
  let sql = "";
  if (status === "active" && existingPhone == false) {
    sql = `Insert into etl.sms_msisdn_tracker values ("${phoneNumber}","${status}")`;
  } else {
    sql = `Update etl.sms_msisdn_tracker set status ="${status}" where msisdn="${phoneNumber}"`;
  }

  console.log("Query", sql);
  
  let result: Patient[] = await CM.query(sql, amrsCON);
  await CM.releaseConnections(amrsCON)
}

export async function checkNumber(msisdn: string) {
  let amrsCON = await CM.getConnectionAmrs();
  let sql = `select * from etl.sms_msisdn_tracker where msisdn="${msisdn}"`;
  console.log("Query", sql);
  let result: any = await CM.query(sql, amrsCON);
  await CM.releaseConnections(amrsCON)
  return result;
}

export async function fetchClientsWithPendingDeliveryStatus() {
  let amrsCON = await CM.getConnectionAmrs();
  let sql = `select message_id from etl.sms_delivery_report where delivery_status="pending"`;
  console.log("Query", sql);
  let result: [] = await CM.query(sql, amrsCON);
  await CM.releaseConnections(amrsCON)
  return result;
}
export async function saveOrUpdateSMSResponse(
  smsResponse: SMSResponse,
  type: string
) {
  let amrsCON = await CM.getConnectionAmrs();
  let sql = "";
  if (type === "create") {
    sql = `Insert into etl.sms_delivery_report values (${smsResponse.person_id},"${smsResponse.phone_number}","${smsResponse.message_type}",${smsResponse.message_id},"${smsResponse.date_created}","${smsResponse.delivery_status}")`;
  } else {
    sql = `Update etl.sms_delivery_report set delivery_status ="${smsResponse.delivery_status}" where message_id="${smsResponse.message_id}"`;
  }

  console.log("Query", sql);
  
  let result: SMSResponse = await CM.query(sql, amrsCON);
  await CM.releaseConnections(amrsCON)
}