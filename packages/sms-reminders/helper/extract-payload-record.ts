import config from '@amrs-integrations/core';
export const queryDB = async (person_id: number) => {
    let CM = config.ConnectionManager.getInstance();
    let amrsCON = await CM.getConnectionAmrs();
    const sql = `
    select * from
    (
        select
            p.person_id,
            mc.mfl_code AS RECEIVING_FACILITY,
            convert(now(), char) AS MESSAGE_DATETIME,
            max(case when pi2.identifier_type = 3 then pi2.identifier end) as PI_EPID_ID,
            max(case when pi2.identifier_type = 3 then pit.name end) as PI_EPID_TYPE,
            max(case when pi2.identifier_type = 3 then 'AMPATH' end) as PI_EPID_ASSIGN_AUTH,
            max(case when pi2.identifier_type = 28 or pi2.identifier_type = 29 then pi2.identifier end) as PI_IPID_1_ID,
            max(case when pi2.identifier_type = 28 or pi2.identifier_type = 29 then pit.name end) as PI_IPID_1_TYPE,
            max(case when pi2.identifier_type = 28 or pi2.identifier_type = 29 then 'CCC' end) as PI_IPID_1_ASSIGN_AUTH,
            max(case when pi2.identifier_type = 45 then pi2.identifier end) as PI_IPID_2_ID,
            max(case when pi2.identifier_type = 45 then pit.name end) as PI_IPID_2_TYPE,
            max(case when pi2.identifier_type = 45 then 'MOH' end) as PI_IPID_2_ASSIGN_AUTH,
            (pn.given_name) as FIRST_NAME,
            (pn.middle_name) as MIDDLE_NAME,
            (pn.family_name) as LAST_NAME, 
            max(case when pa2.person_attribute_type_id = 4 then pa2.value end) as MOTHER_NAME,
            (p.gender) as SEX,
            (pa.city_village) as VILLAGE,
            /*WARD*/
            (pa.county_district) as SUB_COUNTY,
            (pa.state_province) as COUNTY,
            max(case when pa2.person_attribute_type_id = 31 then pa2.value end) as LANDMARK,
            (pa.address1) as POSTAL_ADDRESS,
            max(case when pa2.person_attribute_type_id = 10 then pa2.value end) as PHONE_NUMBER,
            max(case when pa2.person_attribute_type_id = 5 then 'married' end) as MARITAL_STATUS,
            max(case when ((pa.latitude != null) and (pa.longitude != null)) THEN concat(pa.latitude,',',pa.longitude) end) as GPS_LOCATION,
            max(p.death_date) as DEATH_DATE,
            (p.cause_of_death) as DEATH_INDICATOR,
            max(case when p.birthdate_estimated = 0 then 'YES' else 'NO' end) as DATE_OF_BIRTH_PRECESION,
            max(case when pa2.person_attribute_type_id = 12 then pa2.value end) as NOK_NAME,
            max(case when pa2.person_attribute_type_id = 59 then pa2.value end) as NOK_RELATIONSHIP,
            max(case when pa2.person_attribute_type_id = 75 then pa2.value end) as NOK_ADDRESS,
            max(case when pa2.person_attribute_type_id = 25 then pa2.value end) as NOK_PHONE_NUMBER,
            max(case when pa2.person_attribute_type_id = 27 then pa2.value end) as NOK_SEX,
            max(case when pa2.person_attribute_type_id = 24 then (date_sub(date(now()), interval convert(pa2.value, signed)  year)) end) as NOK_DATE_OF_BIRTH,
            (convert(date(fh.encounter_datetime), char)) AS VISIT_DATE,
            (convert(date(fh.enrollment_date), char)) AS HIV_CARE_ENROLLMENT_DATE,
            (convert(date(fh.rtc_date), char)) AS APPOINTMENT_DATE
        from amrs_migration.person p 
        left join amrs_migration.person_name pn on p.person_id = pn.person_id and p.voided = 0 and pn.voided = 0
        left join amrs_migration.person_address pa on pn.person_id = pa.person_id and pa.voided = 0
        left join amrs_migration.person_attribute pa2 on pa.person_id = pa2.person_id and pa2.voided = 0
        left join amrs_migration.patient_identifier pi2 on p.person_id = pi2.patient_id and pi2.voided = 0
        left join amrs_migration.patient_identifier_type pit on pi2.identifier_type = pit.patient_identifier_type_id
        LEFT JOIN ndwr.mfl_codes mc ON pi2.location_id = mc.location_id
        left join etl.flat_hiv_summary_v15b fh on p.person_id = fh.person_id and fh.is_clinical_encounter = 1 AND fh.next_clinical_datetime_hiv IS NULL
        where p.person_id = "${person_id}"
        group by p.person_id
    ) a 
    left join(
        select
            o.person_id,
            cn.units as UNITS,
            convert(date(o.obs_datetime), char) as OBSERVATION_DATETIME,
            cd.hl7_abbreviation as VALUE_TYPE,
            convert((case 
                when o.value_coded is not NULL then o.value_coded
                when o.value_drug is not null then o.value_drug 
                when o.value_datetime is not null then o.value_datetime
                when o.value_numeric is not null then o.value_numeric
                when o.value_modifier is not null then o.value_modifier
                when o.value_text is not null then o.value_text
            end), char)as OBSERVATION_VALUE,
            case when o.value_numeric >= cn.hi_critical  or o.value_numeric <= cn.low_critical then 'Y' else 'N' end as ABNORMAL_FLAGS,
            IF(o.status = "FINAL", "F", NULL) as OBSERVATION_RESULT_STATUS,
            o.concept_id,
            convert(cs.concept_set_id, char) as SET_ID
        from amrs_migration.obs o
        left join amrs_migration.concept c on o.concept_id = c.concept_id
        left join amrs_migration.concept_datatype cd on c.datatype_id = cd.concept_datatype_id
        left join amrs_migration.concept_numeric cn on o.concept_id = cn.concept_id
        left join amrs_migration.concept_set cs on o.concept_id = cs.concept_id
        where o.person_id = "${person_id}"
        group by o.obs_id
    ) b on a.person_id = b.person_id;
    `;
    let result: any = await CM.query(sql, amrsCON);
    console.log(result);
    await CM.releaseConnections(amrsCON);

    return result;
}