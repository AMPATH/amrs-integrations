import config from '@amrs-integrations/core';
import{ Registration } from '../models/registration';
import example from '../models/example.registration_payload.json'
import { Patient } from '../models/patient';
import { now } from 'moment';

let CM = config.ConnectionManager.getInstance();

const queryDB = async (person_id: number) => {
    let amrsCON = await CM.getConnectionAmrs();

    const sql = `SELECT
    amrs_migration.person.person_id,
    amrs_migration.person_name.given_name,
    amrs_migration.person_name.middle_name,
    amrs_migration.person_name.family_name,
    amrs_migration.person.birthdate,
    amrs_migration.person.death_date,
    amrs_migration.person.cause_of_death,
    amrs_migration.person.cause_of_death_non_coded,
    amrs_migration.person_address.address1,
    amrs_migration.person_address.city_village,
    CONCAT(amrs_migration.person_address.latitude, ' ', amrs_migration.person_address.longitude) as gps_location,
    etl.flat_hiv_summary.enrollment_date,
    etl.flat_hiv_summary.hiv_start_date,
    ndwr.mfl_codes.Facility,
    ndwr.mfl_codes.mfl_code,
    ndwr.flat_vitals.weight,
    ndwr.flat_vitals.height
    FROM amrs_migration.person
    INNER JOIN amrs_migration.person_name
    ON amrs_migration.person.person_id = amrs_migration.person_name.person_id
    INNER JOIN amrs_migration.person_address
    ON amrs_migration.person_name.person_id = amrs_migration.person_address.person_id
    INNER JOIN etl.flat_hiv_summary
    ON amrs_migration.person_address.person_id = etl.flat_hiv_summary.person_id
    INNER JOIN ndwr.mfl_codes
    ON ndwr.mfl_codes.location_id = etl.flat_hiv_summary.location_id
    INNER JOIN ndwr.flat_vitals
    ON ndwr.flat_vitals.person_id = amrs_migration.person.person_id;
    where ="${person_id}"`;

    let result: any = await CM.query(sql, amrsCON);
    console.log(result)
    await CM.releaseConnections(amrsCON);

    return result;
}
export const getRegistration = async (param: Patient) => {
    /**
     * 1). Query the DBs for columns required in the payload
     * 2). populate the payload
     * 3). Return the payload
     */
    //scenarios: If it is a ne client
    /*
    a). The client registration payload is build
    */
   let rows = await queryDB(param.person_id);
   let registration: Registration = {
     MESSAGE_HEADER: {
        SENDING_APPLICATION: "AMRS",
        SENDING_FACILITY: rows.mfl_code,
        RECEIVING_APPLICATION: "OpenHIM",
        RECEIVING_FACILITY: "12345",
        MESSAGE_DATETIME: now().toString(),
        SECURITY: "",
        MESSAGE_TYPE: "ADT^A04",
        PROCESSING_ID: "P"
     },
     PATIENT_IDENTIFICATION: {
        EXTERNAL_PATIENT_ID: {
            ID: "12345001212",
            IDENTIFIER_TYPE: "GODS_NUMBER",
            ASSIGNING_AUTHORITY: "MPI"
        },
        INTERNAL_PATIENT_ID: [
            {
               ID: "12345001212",
               IDENTIFIER_TYPE: "CCC_NUMBER",
               ASSIGNING_AUTHORITY: "CCC"
           },
           {
               ID: "MOH2123213123",
               IDENTIFIER_TYPE: "NUPI",
               ASSIGNING_AUTHORITY: "MOH"
           },
        ],
        PATIENT_NAME: {
            FIRST_NAME: rows.given_name,
            MIDDLE_NAME: rows.middle_name,
            LAST_NAME: rows.family_name
        },
        MOTHER_NAME: {
            FIRST_NAME: "",
            MIDDLE_NAME: "",
            LAST_NAME: ""
        },
        DATE_OF_BIRTH: rows.birthdate,
        SEX: "M",
        PATIENT_ADDRESS: {
            PHYSICAL_ADDRESS: {
                VILLAGE: "",
                WARD: "",
                SUB_COUNTY: "",
                COUNTY: "",
                GPS_LOCATION: "",
                NEAREST_LANDMARK: ""
            },
            POSTAL_ADDRESS: ""
        },
        PHONE_NUMBER: rows.phone_number,
        MARITAL_STATUS: "",
        DEATH_DATE: rows.death_date,
        DEATH_INDICATOR: rows.cause_of_death_non_coded,
        DATE_OF_BIRTH_PRECISION: ""
     },
     NEXT_OF_KIN: [
        {
            NOK_NAME: {
                FIRST_NAME: "",
                MIDDLE_NAME: "",
                LAST_NAME: ""
            },
            RELATIONSHIP: "",
            ADDRESS: "",
            PHONE_NUMBER: "",
            SEX: "",
            DATE_OF_BIRTH: "",
            CONTACT_ROLE: ""
        }
     ],
     PATIENT_VISIT: {
        VISIT_DATE: rows.enrollment_date,
        PATIENT_SOURCE: "",
        HIV_CARE_ENROLLMENT_DATE: rows.hiv_start_date,
        PATIENT_TYPE: "ART"
     },
     OBSERVATION_RESULT: [
        {
            UNITS: "KG",
            VALUE_TYPE: "NM",
            OBSERVATION_VALUE: rows.weight,
            OBSERVATION_DATETIME: "20190313",
            CODING_SYSTEM: "",
            ABNORMAL_FLAGS: "N",
            OBSERVATION_RESULT_STATUS: "F",
            SET_ID: "",
            OBSERVATION_IDENTIFIER: "START_WEIGHT"
        },
        {
            UNITS: "CM",
            VALUE_TYPE: "NM",
            OBSERVATION_VALUE: rows.height,
            OBSERVATION_DATETIME: "20190313",
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