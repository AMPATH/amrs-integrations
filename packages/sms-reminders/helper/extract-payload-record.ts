import config from '@amrs-integrations/core';
export const queryDB = async (person_id: number) => {
    let CM = config.ConnectionManager.getInstance();
    let amrsCON = await CM.getConnectionAmrs();
    const sql = `
	SELECT p.person_id,
       mc.mfl_code AS RECEIVING_FACILITY,
       convert(now(), char) AS MESSAGE_DATETIME,
       pn.given_name AS FIRST_NAME,
       pn.middle_name AS MIDDLE_NAME,
       pn.family_name AS LAST_NAME,
       p.gender AS SEX,
       convert(p.birthdate, char) AS DATE_OF_BIRTH,
       (CASE
            WHEN p.birthdate_estimated = 1 THEN 'Y'
            ELSE 'N'
        END) AS DATE_OF_BIRTH_PRECISION,
       convert(p.death_date, char) AS DEATH_DATE,
       concat(p.cause_of_death, '. ', p.cause_of_death_non_coded) AS DEATH_INDICATOR,
       max(CASE
               WHEN pa2.person_attribute_type_id = 10 THEN pa2.value
           END) AS PHONE_NUMBER,
       pa.city_village AS VILLAGE,
       pa.address1 AS POSTAL_ADDRESS,
       pa.state_province AS COUNTY,
       pa.county_district AS SUB_COUNTY,
       SUBSTRING_INDEX((CASE
                            WHEN pa2.person_attribute_type_id = 4 THEN pa2.value
                        END), ' ', 1) AS MOTHER_FIRST_NAME,
       SUBSTRING_INDEX((CASE
                            WHEN pa2.person_attribute_type_id = 4 THEN pa2.value
                        END), ' ', -1) AS MOTHER_LAST_NAME,
       (CASE
            WHEN (pa.longitude != NULL
                  AND pa.latitude != NULL) THEN CONCAT(pa.longitude, ',', pa.latitude)
        END) AS GPS_LOCATION,
       max(CASE
               WHEN pa2.person_attribute_type_id = 31 THEN pa2.value
           END) AS LAND_MARK,
       max(CASE
               WHEN pa2.person_attribute_type_id = 59 THEN pa2.value
           END) AS NOK_RELATIONSHIP,
       CASE
           WHEN pa2.person_attribute_type_id = 12 THEN pa2.value
       END AS NOK_NAME,
       pn2.given_name AS NOK_FIRST_NAME,
       pn2.middle_name AS NOK_MIDDLE_NAME,
       pn2.family_name AS NOK_LAST_NAME,
       convert(p2.birthdate, char) AS NOK_DATE_OF_BIRTH,
       CASE
           WHEN pa2.person_attribute_type_id = 25 THEN pa2.value
       END AS NOK_PHONE_NUMBER,
       p2.gender AS NOK_GENDER,
       p2a.address1 AS NOK_ADDRESS,
       max(CASE
               WHEN pi2.identifier_type = 8 THEN pi2.identifier
           END) AS EPI_IDENTIFIER_TYPE_ID,
       max(CASE
               WHEN pi2.identifier_type = 8 THEN pit.name
           END) AS EPI_IDENTIFIER_TYPE_NAME,
       max(CASE
               WHEN (pi2.identifier_type = 28
                     OR pi2.identifier_type = 29) THEN pi2.identifier
           END) AS IPI_IDENTIFIER_TYPE_1_ID,
       max(CASE
               WHEN (pi2.identifier_type = 28
                     OR pi2.identifier_type = 29) THEN pit.name
           END) AS IPI_IDENTIFIER_TYPE_1_NAME,
       max(CASE
               WHEN pi2.identifier_type = 45 THEN pi2.identifier
           END)AS IPI_IDENTIFIER_TYPE_2_ID,
       max(CASE
               WHEN pi2.identifier_type = 45 THEN pit.name
           END)AS IPI_IDENTIFIER_TYPE_2_NAME,
       max(CASE
               WHEN r.relationship = 7 THEN "married"
           END) AS MARITAL_STATUS,
       convert(fh.weight, char) AS WEIGHT,
       convert(fh.height, char) AS HEIGHT,
       convert(date(fh.encounter_datetime), char) AS VISIT_DATE,
       e.encounter_datetime,
       et.name AS PATIENT_TYPE,
       convert(date(fh.enrollment_date), char) AS HIV_CARE_ENROLLMENT_DATE,
       convert(date(fh.rtc_date), char) AS APPOINTMENT_DATE,
       u.username AS PLACER_ENTITY,
       convert(e.creator, char) AS PLACER_NUMBER,
       vt.name AS VISIT_TYPE
FROM amrs_migration.person p
LEFT JOIN amrs_migration.person_name pn ON p.person_id = pn.person_id
AND pn.voided = 0
LEFT JOIN amrs_migration.person_address pa ON p.person_id = pa.person_id
AND pa.voided = 0
LEFT JOIN amrs_migration.patient_identifier pi2 ON p.person_id = pi2.patient_id
AND pi2.voided = 0
LEFT JOIN amrs_migration.patient_identifier_type pit ON pi2.identifier_type = pit.patient_identifier_type_id
LEFT JOIN amrs_migration.person_attribute pa2 ON p.person_id = pa2.person_id
AND pa2.voided = 0
LEFT JOIN amrs_migration.person_attribute_type pat ON pa2.person_attribute_type_id = pat.person_attribute_type_id
LEFT JOIN amrs_migration.relationship r ON p.person_id = r.person_a
AND r.voided = 0
LEFT JOIN amrs_migration.relationship_type rt ON r.relationship = rt.relationship_type_id
LEFT JOIN ndwr.flat_vitals fv ON p.person_id = fv.person_id
LEFT JOIN etl.flat_hiv_summary_v15b fh ON fh.person_id = p.person_id
AND fh.is_clinical_encounter = 1
AND fh.next_clinical_datetime_hiv IS NULL
LEFT JOIN amrs_migration.person p2 ON p2.person_id = r.person_b
AND p2.voided = 0
LEFT JOIN amrs_migration.person_name pn2 ON p2.person_id = pn2.person_id
AND pn2.voided = 0
LEFT JOIN amrs_migration.person_attribute pa3 ON pa3.person_id = p2.person_id
AND pa3.voided = 0
LEFT JOIN amrs_migration.person_address p2a ON p2a.person_id = p2.person_id
AND p2a.voided = 0
LEFT JOIN amrs_migration.encounter_type et ON fh.encounter_type = et.encounter_type_id
LEFT JOIN amrs_migration.encounter e ON e.encounter_id = et.encounter_type_id
LEFT JOIN amrs_migration.users u ON u.user_id = e.creator
LEFT JOIN ndwr.mfl_codes mc ON pi2.location_id = mc.location_id
LEFT JOIN amrs_migration.visit v ON v.patient_id = p.person_id
LEFT JOIN amrs_migration.visit_type vt ON vt.visit_type_id = v.visit_type_id
WHERE pi2.patient_id = "${person_id}"
  AND p.voided = 0
GROUP BY fh.person_id;
    `;
    let result: any = await CM.query(sql, amrsCON);

    await CM.releaseConnections(amrsCON);

    return result;
}