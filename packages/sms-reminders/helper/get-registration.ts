import config from '@amrs-integrations/core';
import{ Registration } from '../models/registration';
import { Patient } from '../models/patient';

let CM = config.ConnectionManager.getInstance();

const queryDB = async (person_id: number) => {
    let amrsCON = await CM.getConnectionAmrs();
    const sql = `
    select
	p.person_id,
	mc.mfl_code as RECEIVING_FACILITY,
	convert(now(), char) as MESSAGE_DATETIME,
	pn.given_name as FIRST_NAME,
	pn.middle_name as MIDDLE_NAME,
	pn.family_name as LAST_NAME,
	p.gender as SEX,
	convert(p.birthdate, char) as DATE_OF_BIRTH,
	(case when p.birthdate_estimated = 1 then 'Y' else 'N' end) as DATE_OF_BIRTH_PRECISION,
	convert(p.death_date, char) as DEATH_DATE,
	concat(p.cause_of_death, '. ', p.cause_of_death_non_coded) as DEATH_INDICATOR,
	max(case when pa2.person_attribute_type_id = 10 then pa2.value end) as PHONE_NUMBER,
	pa.city_village as VILLAGE,
	pa.address1 as POSTAL_ADDRESS,
	pa.state_province as COUNTY,
	pa.county_district as SUB_COUNTY,
	SUBSTRING_INDEX((case when pa2.person_attribute_type_id = 4 then pa2.value end), ' ', 1) as MOTHER_FIRST_NAME,
	SUBSTRING_INDEX((case when pa2.person_attribute_type_id = 4 then pa2.value end), ' ', -1) as MOTHER_LAST_NAME,
	CONCAT(pa.longitude, ',', pa.latitude) as GPS_LOCATION,
	max(case when pa2.person_attribute_type_id = 31 then pa2.value end) as LAND_MARK,
	max(case when pa2.person_attribute_type_id = 59 then pa2.value end) as NOK_RELATIONSHIP,
	case when pa2.person_attribute_type_id = 12 then pa2.value end as NOK_NAME,
	pn2.given_name  as NOK_FIRST_NAME,
	pn2.middle_name as NOK_MIDDLE_NAME,
	pn2.family_name as NOK_LAST_NAME,
	convert(p2.birthdate, char) as NOK_DATE_OF_BIRTH,
	case when pa2.person_attribute_type_id = 25 then pa2.value end as NOK_PHONE_NUMBER,
	p2.gender as NOK_GENDER,
	p2a.address1 as NOK_ADDRESS,
	max(case when pi2.identifier_type = 8 then pi2.identifier end) as GODS_NUMBER,
	max(case when (pi2.identifier_type = 28 or pi2.identifier_type = 29)  then pi2.identifier end) as IPI_IDENTIFIER_TYPE_1_ID,
	max(case when (pi2.identifier_type = 28 or pi2.identifier_type = 29)  then pit.name end) as IPI_IDENTIFIER_TYPE_1_NAME,
	max(case when pi2.identifier_type = 45 then pi2.identifier end)as IPI_IDENTIFIER_TYPE_2_ID,
	max(case when pi2.identifier_type = 45 then pit.name  end)as IPI_IDENTIFIER_TYPE_2_NAME,
	max(case when r.relationship  = 7 then "married" end) as MARITAL_STATUS,
	convert(fh.weight, char) as WEIGHT,
	convert(fh.height, char) as HEIGHT,
	convert(date(fh.encounter_datetime), char) as VISIT_DATE,
	et.name as PATIENT_TYPE,
	convert(date(fh.enrollment_date), char) as HIV_CARE_ENROLLMENT_DATE,
	convert(date(fh.rtc_date), char) as APPOINTMENT_DATE,
	u.username as PLACER_ENTITY,
	e.creator  as PLACER_NUMBER
from amrs_migration.person p 
left join amrs_migration.person_name pn on p.person_id = pn.person_id and pn.voided = 0
left join amrs_migration.person_address pa on p.person_id = pa.person_id and pa.voided = 0
left join amrs_migration.patient_identifier pi2 on p.person_id = pi2.patient_id and pi2.voided = 0
left join amrs_migration.patient_identifier_type pit on pi2.identifier_type = pit.patient_identifier_type_id
left join amrs_migration.person_attribute pa2 on p.person_id = pa2.person_id and pa2.voided = 0
left join amrs_migration.person_attribute_type pat on pa2.person_attribute_type_id = pat.person_attribute_type_id
left join amrs_migration.relationship r on p.person_id  = r.person_a and r.voided = 0  
left join amrs_migration.relationship_type rt on r.relationship = rt.relationship_type_id
left join ndwr.flat_vitals fv on p.person_id = fv.person_id 
left join etl.flat_hiv_summary_v15b fh on fh.person_id = p.person_id and fh.is_clinical_encounter = 1 and fh.next_clinical_datetime_hiv is null
left join amrs_migration.person p2 on p2.person_id = r.person_b and p2.voided = 0
left join amrs_migration.person_name pn2 on p2.person_id = pn2.person_id and pn2.voided = 0
left join amrs_migration.person_attribute pa3  on pa3.person_id = p2.person_id and pa3.voided = 0
left join amrs_migration.person_address p2a on p2a.person_id = p2.person_id  and p2a.voided = 0
left join amrs_migration.encounter_type et on fh.encounter_type = et.encounter_type_id 
left join amrs_migration.encounter e on e.encounter_id = et.encounter_type_id 
left join amrs_migration.users u on u.user_id = e.creator 
inner join ndwr.mfl_codes mc on pi2.location_id  = mc.location_id 
where pi2.patient_id =  "${person_id}" and p.voided = 0
group by fh.person_id;
    `;
    let result: any = await CM.query(sql, amrsCON);
    await CM.releaseConnections(amrsCON);

    return result;
}
export const getRegistration = async (param: Patient) => {

    console.log(param, param.person_id);
   let rows = await queryDB(param.person_id);
   if (rows.length === 0) return null;
   let registration: Registration = {
     MESSAGE_HEADER: {
        SENDING_APPLICATION: "KENYAEMR",
        SENDING_FACILITY: rows[0].RECEIVING_FACILITY,
        RECEIVING_APPLICATION: "AMRS",
        RECEIVING_FACILITY: rows[0].RECEIVING_FACILITY,
        MESSAGE_DATETIME: ((rows[0].MESSAGE_DATETIME).toString()).replace(/[-:\s]/g,''),
        SECURITY: "",
        MESSAGE_TYPE: "ADT^A04",
        PROCESSING_ID: "P"
     },
     PATIENT_IDENTIFICATION: {
        EXTERNAL_PATIENT_ID: {
            ID: (rows[0].GODS_NUMBER?.toString())?.replace(/-/g,''),
            IDENTIFIER_TYPE: "GODS_NUMBER",
            ASSIGNING_AUTHORITY: "MPI"

        },
        INTERNAL_PATIENT_ID: [
            {
               ID: rows[0].IPI_IDENTIFIER_TYPE_1_ID?.replace(/-/g,'') || '',
               IDENTIFIER_TYPE: rows[0].IPI_IDENTIFIER_TYPE_1_NAME,
               ASSIGNING_AUTHORITY: "CCC"
           },
           {
               ID: rows[0].IPI_IDENTIFIER_TYPE_2_ID || '',
               IDENTIFIER_TYPE: rows[0].IPI_IDENTIFIER_TYPE_2_NAME,
               ASSIGNING_AUTHORITY: "MOH"
           },
        ],
        PATIENT_NAME: {
            FIRST_NAME: rows[0].FIRST_NAME,
            MIDDLE_NAME: rows[0].MIDDLE_NAME,
            LAST_NAME: rows[0].LAST_NAME
        },
        MOTHER_NAME: {
            FIRST_NAME: rows[0].MOTHER_FIRST_NAME || "",
            MIDDLE_NAME: rows[0].MOTHER_NAME,
            LAST_NAME: rows[0].MOTHER_LAST_NAME || ""
        },
        DATE_OF_BIRTH: (rows[0].DATE_OF_BIRTH)?.replace(/-/g,''),
        SEX: rows[0].SEX || "",
        PATIENT_ADDRESS: {
            PHYSICAL_ADDRESS: {
                VILLAGE: rows[0].VILLAGE || "",
                WARD: "",
                SUB_COUNTY: rows[0].SUB_COUNTY || "",
                COUNTY: rows[0].COUNTY || "",
                GPS_LOCATION: rows[0].GPS_LOCATION || "",
                NEAREST_LANDMARK: rows[0].LAND_MARK || ""
            },
            POSTAL_ADDRESS: rows[0].POSTAL_ADDRESS || ""
        },
        PHONE_NUMBER: param.phone_number || rows[0].PHONE_NUMBER || '',
        MARITAL_STATUS: rows[0].MARITAL_STATUS || "",
        DEATH_DATE: rows[0].DEATH_DATE?.replace(/[-:\s]/g,'') || "",
        DEATH_INDICATOR: rows[0].DEATH_INDICATOR || "",
        DATE_OF_BIRTH_PRECISION: rows[0].DATE_OF_BIRTH_PRECISION
     },
     NEXT_OF_KIN: [
        {
            NOK_NAME: {
                FIRST_NAME: rows[0].NOK_FIRST_NAME || "",
                MIDDLE_NAME: rows[0].NOK_MIDDLE_NAME || "",
                LAST_NAME: rows[0].NOK_LAST_NAME || ""
            },
            RELATIONSHIP: rows[0].NOK_RELATIONSHIP || "",
            ADDRESS: rows[0].NOK_ADDRESS || "",
            PHONE_NUMBER: rows[0].NOK_PHONE_NUMBER || "",
            SEX: rows[0].NOK_GENDER || "",
            DATE_OF_BIRTH: (rows[0].NOK_DATE_OF_BIRTH?.toString())?.replace(/-/g,'') || "",
            CONTACT_ROLE: ""
        } 
     ],
     PATIENT_VISIT: {
        VISIT_DATE: (rows[0].VISIT_DATE)?.toString().replace(/[-:\s]/g,'')|| "",
        PATIENT_SOURCE: "",
        HIV_CARE_ENROLLMENT_DATE: (rows[0].HIV_CARE_ENROLLMENT_DATE)?.replace(/[-:\s]/g,'')|| "",
        PATIENT_TYPE: rows[0].PATIENT_TYPE || ""
     },
     OBSERVATION_RESULT: [
        {
            UNITS: "KG",
            VALUE_TYPE: "NM",
            OBSERVATION_VALUE: (rows[0].WEIGHT)?.toString() || "",
            OBSERVATION_DATETIME:(rows[0].VISIT_DATE)?.toString().replace(/[-:\s]/g,'')|| "",
            CODING_SYSTEM: "",
            ABNORMAL_FLAGS: "N",
            OBSERVATION_RESULT_STATUS: "F",
            SET_ID: "",
            OBSERVATION_IDENTIFIER: "START_WEIGHT"
        },
        {
            UNITS: "CM",
            VALUE_TYPE: "NM",
            OBSERVATION_VALUE: (rows[0].HEIGHT)?.toString() || "",
            OBSERVATION_DATETIME:(rows[0].VISIT_DATE)?.toString().replace(/[-:\s]/g,'')|| "",
            CODING_SYSTEM: "",
            ABNORMAL_FLAGS: "N",
            OBSERVATION_RESULT_STATUS: "F",
            SET_ID: "",
            OBSERVATION_IDENTIFIER: "START_WEIGHT"
        },
        {
            UNITS: "",
            VALUE_TYPE: "DT",
            OBSERVATION_VALUE: "20210310",
            OBSERVATION_DATETIME: "20190313",
            CODING_SYSTEM: "",
            ABNORMAL_FLAGS: "N",
            OBSERVATION_RESULT_STATUS: "F",
            SET_ID: "",
            OBSERVATION_IDENTIFIER: "ART_START"
        }
     ]
   }
 
    const payload = registration;

    return payload;
}