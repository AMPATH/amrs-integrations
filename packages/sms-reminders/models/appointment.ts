export interface Appointment {
    MESSAGE_HEADER: MessageHeader
    PATIENT_IDENTIFICATION: PatientIdentification
    APPOINTMENT_INFORMATION: AppointmentInformation[]
    OBSERVATION_RESULT: ObservationResult[]
  }
  
  export interface MessageHeader {
    SENDING_APPLICATION: string
    SENDING_FACILITY: string
    RECEIVING_APPLICATION: string
    RECEIVING_FACILITY: string
    MESSAGE_DATETIME: string
    SECURITY: string
    MESSAGE_TYPE: string
    PROCESSING_ID: string
  }
  
  export interface PatientIdentification {
    EXTERNAL_PATIENT_ID: ExternalPatientId
    INTERNAL_PATIENT_ID: InternalPatientId[]
    PATIENT_NAME: PatientName
    MOTHER_NAME: MotherName
    DATE_OF_BIRTH: string
    SEX: string
    PATIENT_ADDRESS: PatientAddress
    PHONE_NUMBER: string
    MARITAL_STATUS: string
    DEATH_DATE: string
    DEATH_INDICATOR: string
    DATE_OF_BIRTH_PRECISION: string
  }
  
  export interface ExternalPatientId {
    ID: string
    IDENTIFIER_TYPE: string
    ASSIGNING_AUTHORITY: string
  }
  
  export interface InternalPatientId {
    ID: string
    IDENTIFIER_TYPE: string
    ASSIGNING_AUTHORITY: string
  }
  
  export interface PatientName {
    FIRST_NAME: string
    MIDDLE_NAME: string
    LAST_NAME: string
  }
  
  export interface MotherName {
    FIRST_NAME: string
    MIDDLE_NAME: string
    LAST_NAME: string
  }
  
  export interface PatientAddress {
    PHYSICAL_ADDRESS: PhysicalAddress
    POSTAL_ADDRESS: string
  }
  
  export interface PhysicalAddress {
    VILLAGE: string
    WARD: string
    SUB_COUNTY: string
    COUNTY: string
    GPS_LOCATION: string
    NEAREST_LANDMARK: string
  }
  
  export interface AppointmentInformation {
    APPOINTMENT_REASON: string
    ACTION_CODE: string
    APPOINTMENT_PLACING_ENTITY: string
    APPOINTMENT_STATUS: string
    APPOINTMENT_TYPE: string
    APPOINTMENT_NOTE: string
    APPOINTMENT_DATE: string
    VISIT_DATE: string
    PLACER_APPOINTMENT_NUMBER: PlacerAppointmentNumber
    CONSENT_FOR_REMINDER: string
  }
  export interface PlacerAppointmentNumber {
    ENTITY: string
    NUMBER: string
  }
  export interface ObservationResult {
    UNITS: string
    VALUE_TYPE: string
    OBSERVATION_VALUE: string
    OBSERVATION_DATETIME: string
    CODING_SYSTEM: string
    ABNORMAL_FLAGS: string
    OBSERVATION_RESULT_STATUS: string
    SET_ID: string
    OBSERVATION_IDENTIFIER: string
  }