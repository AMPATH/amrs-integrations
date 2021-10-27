import { Connection } from "mysql";
import ConnectionManager from "../loaders/mysql";
const CM = ConnectionManager.getInstance();

export async function loadPatient(patient_uuid: string, connection: any) {
  const sql = large_query(patient_uuid);
  let result = await CM.query(sql, connection);
  CM.releaseConnections(connection);
  return result;
}

export async function loadProviderData(uuid: string, connection: any) {
  const sql = `SELECT 
    pn.given_name,
    pn.family_name,
    pn.middle_name
  FROM
    amrs.provider p
        left JOIN
    amrs.person_name pn ON (p.person_id = pn.person_id
        AND pn.voided = 0
  )
  WHERE
    p.uuid = '${uuid}'`;
  let result = await CM.query(sql, connection);
  CM.releaseConnections(connection);
  return result[0];
}

function large_query(patient_uuid: string) {
  return `
  SELECT 
    CASE
        WHEN
            visit_type IN (2 , 7, 10, 12, 13, 14, 15, 16, 19, 20, 25, 26, 40, 43, 44, 48, 49, 58, 59, 80, 98, 99, 102, 103, 109, 111, 112, 113, 114, 115, 118, 119, 120, 123)
        THEN
            'OUTPATIENT'
        WHEN visit_type IN (8 , 11) THEN 'TRANSFER IN'
        WHEN visit_type IN (23 , 24, 124, 129) THEN 'TRANSIT'
        WHEN visit_type IN (51 , 52, 54, 55, 56, 68, 69) THEN 'PMTCT'
        WHEN visit_type IN (53) THEN 'VCT'
        WHEN visit_type IN (47) THEN 'MCH'
        ELSE NULL
    END AS 'source',
    CASE
        WHEN t1.program_id IN (4) THEN 3
        WHEN t1.program_id IN (1 , 9, 27) THEN 1
        WHEN t1.program_id IN (11) THEN 2
        WHEN t1.program_id IN (10) THEN 5
        WHEN t1.program_id IN (29) THEN 7
        ELSE NULL
    END AS 'service',
    IF(is_pregnant = 1 AND p.gender = 'F',
        'YES',
        NULL) AS 'is_pregnant',
    IF(is_mother_breastfeeding = 1
            AND p.gender = 'F',
        'YES',
        NULL) AS 'is_mother_breastfeeding',
	v.height, v.weight, c.mflCode as 'mfl_code',
    person_name.given_name AS 'first_name',
    person_name.family_name AS 'last_name',
    person_name.middle_name AS 'other_name',
    p.birthdate AS 'date_of_birth',
    p.death_date,
    p.gender,
    p.uuid as 'patient_uuid',
    p.person_id,
    contacts.value AS 'phone',
    pa.city_village AS 'address',
    a.identifier AS 'medical_record_no',
    c.identifier AS 'patient_ccc_number',
    encounter_id,
    encounter_type,
    visit_type,
    fhs.encounter_datetime,
    fhs.location_id,
    rtc_date,
    fhs.uuid,
    cur_arv_meds,
    arv_start_date,
    cur_who_stage,
    enrollment_date,
    on_modern_contraceptive,
    contraceptive_method
FROM
    amrs.person p
        LEFT JOIN
    amrs.person_name person_name ON (p.person_id = person_name.person_id
        AND person_name.voided = 0
        AND person_name.preferred = 1)
        LEFT JOIN
    amrs.person_attribute contacts ON (p.person_id = contacts.person_id
        AND (contacts.voided IS NULL
        || contacts.voided = 0)
        AND contacts.person_attribute_type_id = 10)
        LEFT JOIN
    amrs.person_address pa ON (p.person_id = pa.person_id)
        LEFT JOIN
    amrs.patient_identifier a ON (a.patient_id = p.person_id
        AND a.voided = 0
        AND a.identifier_type = 3)
        LEFT JOIN
    amrs.patient_identifier c ON (c.patient_id = p.person_id
        AND c.voided = 0
        AND c.identifier_type = 28)
        LEFT JOIN
    etl.flat_hiv_summary_v15b fhs ON (p.person_id = fhs.person_id
        AND fhs.next_clinical_datetime_hiv IS NULL)
        LEFT JOIN
    amrs.patient_program t1 ON (p.person_id = t1.patient_id
        AND t1.program_id IN (4 , 1, 9, 27, 11, 10, 29)
        AND t1.date_completed IS NULL)
        LEFT JOIN
    (SELECT 
        height, weight, person_id, encounter_datetime
    FROM
        etl.flat_vitals
    WHERE
        uuid = '0e52e27c-3ef2-4071-87c9-b48b78f2530f'
            AND weight IS NOT NULL
            AND height IS NOT NULL
    ORDER BY encounter_datetime DESC) v ON (p.person_id = v.person_id)
    left join etl.mfl_codes c on (fhs.location_id = c.mrsId)
WHERE
    p.uuid = '0e52e27c-3ef2-4071-87c9-b48b78f2530f'
GROUP BY p.person_id;`;
}

export async function loadPatientDataByID(
  personId: string,
  connection: Connection
) {
  const personCCC = await fetchPersonCCCByID(personId, connection);
  console.log(personCCC, personId);
  return await loadPatientData(
    personCCC.patient_ccc_number
      ? personCCC?.patient_ccc_number
      : personCCC?.medical_record_no,
    connection
  );
}

export async function fetchPersonCCCByID(personId: any, connection: any) {
  //Return static cc for testing.
  const sql = `select patient_ccc_number, medical_record_no from etl.flat_adt_patient where person_id='${personId}'`;
  let result: any = await CM.query(sql, connection);
  return result[0];
}
export async function loadPatientData(personCCC: string, connection: any) {
  const sql = `select * from etl.flat_adt_patient where patient_ccc_number='${personCCC}'`;
  let result: Patient.Patient = await CM.query(sql, connection);
  CM.releaseConnections(connection);
  return result;
}
export async function fetchEncounterUUID(personCCC: string, connection: any) {
  const sql = `SELECT 
                loc.uuid AS location_uuid,
                enc_type.uuid AS encounter_type_uuid,
                person.uuid AS patient_uuid,
                provider.uuid AS provider_uuid,
                'a0b03050-c99b-11e0-9572-0800200c9a66' AS encounter_role,
                enc.uuid AS encounter_uuid
              FROM
                etl.flat_adt_patient a
                    INNER JOIN
                amrs.location loc ON loc.location_id = a.location_id
                    INNER JOIN
                amrs.encounter_type enc_type ON enc_type.encounter_type_id = a.encounter_type
                    INNER JOIN
                amrs.person person ON person.person_id = a.person_id
                    INNER JOIN
                amrs.encounter enc ON enc.encounter_id = a.encounter_id
                    INNER JOIN
                amrs.encounter_provider enc_prov ON enc_prov.encounter_id = enc.encounter_id
                    INNER JOIN
                amrs.provider provider ON provider.provider_id = enc_prov.provider_id
              WHERE
                a.patient_ccc_number =  '${personCCC}'`;
  let result: any = await CM.query(sql, connection);
  CM.releaseConnections(connection);
  return result;
}
export async function loadPatientQueue(connection: Connection) {
  // Only fetch patients from location test.
  const sql = `select distinct(person_id),mfl_code from etl.adt_poc_integration_queue order by date_created desc`;
  let result: any[] = await CM.query(sql, connection);
  if (result.length > 0) {
    const dequeue = `Truncate etl.adt_poc_integration_queue`;
    await CM.query(dequeue, connection);
  }
  CM.releaseConnections(connection);
  return result;
}
