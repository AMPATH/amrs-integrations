export interface Patient {
  person_id: number;
  encounter_type: number;
  program: string;
  rtc_date: Date;
  med_pick_up_date?: any;
  prev_clinical_encounter_datetime?: any;
  next_clinical_encounter_datetime?: any;
  scheduled_date: string;
  patients: number;
  arv_first_regimen_start_date: string;
  patient_uuid: string;
  uuid: string;
  gender: string;
  birthdate: Date;
  age: number;
  person_name: string;
  identifiers: string;
  phone_number: string;
  latest_rtc_date: string;
  latest_vl: number;
  latest_vl_date: string;
  last_appointment: string;
  visit_type: string;
  cur_meds: string;
  previous_vl: number;
  previous_vl_date: string;
  nearest_center: string;
  timeToSend: string;
  language: string;
  messageType: string;
}
export interface SMSResponse {
  person_id: number;
  phone_number: string;
  message_type: string;
  message_id: number;
  date_created: string;
  delivery_status: string;
}
