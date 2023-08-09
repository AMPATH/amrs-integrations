import{ Registration } from '../models/registration';
import { Patient } from '../models/patient';

export const getRegistration = async (param: Patient, rows: any[]) => {

   if (rows.length === 0) return null;
   let payload: Registration = {
    MESSAGE_HEADER: {
        SENDING_APPLICATION: "AMRS",
        SENDING_FACILITY: rows[0].RECEIVING_FACILITY,
        RECEIVING_APPLICATION: "IL",
        RECEIVING_FACILITY: "12345",
        MESSAGE_DATETIME: ((rows[0].MESSAGE_DATETIME).toString()).replace(/[-:\s]/g,''),
        SECURITY: "",
        MESSAGE_TYPE: "ADT^A04",
        PROCESSING_ID: "P"
    },
    PATIENT_IDENTIFICATION: {
        EXTERNAL_PATIENT_ID: {
            ID: rows[0].EPI_IDENTIFIER_TYPE_ID?.toString().replace(/-/g,'') || '',
            IDENTIFIER_TYPE: "AMRS_UNIVERSAL_ID",
            ASSIGNING_AUTHORITY: "MPI"

        },
        INTERNAL_PATIENT_ID: [
            {
               ID: rows[0].IPI_IDENTIFIER_TYPE_1_ID?.replace(/-/g,'') || '',
               IDENTIFIER_TYPE: "CCC_NUMBER",
               ASSIGNING_AUTHORITY: "CCC"
           },
           {
               ID: rows[0].IPI_IDENTIFIER_TYPE_2_ID?.replace(/-/g,'')  || '',
               IDENTIFIER_TYPE: "NUPI",
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
            MIDDLE_NAME: rows[0].MOTHER_NAME || "",
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
        DEATH_INDICATOR: rows[0].DEATH_INDICATOR?.toString() || "",
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
        VISIT_DATE: rows[0].VISIT_DATE?.toString().replace(/[-:\s]/g,'')|| "",
        PATIENT_SOURCE: rows[0].PATIENT_SOURCE || "",
        HIV_CARE_ENROLLMENT_DATE: rows[0].HIV_CARE_ENROLLMENT_DATE?.replace(/[-:\s]/g,'')|| "",
        PATIENT_TYPE: "ART"
     },
     OBSERVATION_RESULT: [
        {
            UNITS: "KG",
            VALUE_TYPE: "NM",
            OBSERVATION_VALUE: rows[0].WEIGHT?.toString() || "",
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
            OBSERVATION_IDENTIFIER: "START_HEIGHT"
        },
        {
            UNITS: "",
            VALUE_TYPE: "DT",
            OBSERVATION_VALUE: rows[0].ART_START?.toString().replace(/[-:\s]/g,'')|| "",
            OBSERVATION_DATETIME: (rows[0].VISIT_DATE)?.toString().replace(/[-:\s]/g,'')|| "",
            CODING_SYSTEM: "",
            ABNORMAL_FLAGS: "N",
            OBSERVATION_RESULT_STATUS: "F",
            SET_ID: "",
            OBSERVATION_IDENTIFIER: "ART_START"
        }
     ]
   }
   return payload;
}