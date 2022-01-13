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
    pn.middle_name,
    pn.prefix
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

export async function loadEncounterData(uuid: string) {
  const CM = ConnectionManager.getInstance();
  const connection = await CM.getConnectionAmrs();
  const sql = `select * from amrs.encounter where uuid = '${uuid}'`;
  let result = await CM.query(sql, connection);
  CM.releaseConnections(connection);
  return result;
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
        ELSE 1
    END AS 'service',
    IF(is_pregnant = 1 AND p.gender = 'F',
        '1',
        0) AS 'is_pregnant',
    IF(is_mother_breastfeeding = 1
            AND p.gender = 'F',
        'YES',
        NULL) AS 'is_mother_breastfeeding',
    case when v.height is not null then v.height else fhs.height end as 'height',
    case when v.weight is not null then v.weight else fhs.weight end as 'weight',
    c.mflCode as 'mfl_code',
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
    case when REPLACE(etl.get_arv_names(arv_first_regimen), '##', '+') is not null then REPLACE(etl.get_arv_names(arv_first_regimen), '##', '+')
    else REPLACE(etl.get_arv_names(cur_arv_meds), '##', '+')
    end arv_first_regimen,
    case when arv_first_regimen_start_date is not null then arv_first_regimen_start_date else arv_start_date end as arv_first_regimen_start_date,
    REPLACE(etl.get_arv_names(cur_arv_meds), '##', '+') as cur_arv_meds,
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
        uuid =  '${patient_uuid}'
            AND weight IS NOT NULL
            AND height IS NOT NULL
    ORDER BY encounter_datetime DESC) v ON (p.person_id = v.person_id)
    left join etl.mfl_codes c on (fhs.location_id = c.mrsId)
WHERE
    p.uuid = '${patient_uuid}'
GROUP BY p.person_id;`;
}
