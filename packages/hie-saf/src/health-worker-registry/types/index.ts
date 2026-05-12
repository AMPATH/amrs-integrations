export interface HealthWokerApiResponse {
  message: Message;
}

export interface Message {
  membership: HealthWoker;
  licenses: License[];
  professional_details: ProfessionalDetails;
  contacts: Contacts;
  identifiers: Identifiers;
}

export interface HealthWoker {
  id: string;
  status: string;
  salutation: string;
  full_name: string;
  gender: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  registration_id: string;
  external_reference_id: string;
  licensing_body: string;
  specialty: string;
  is_active: number;
  is_withdrawn: number;
  withdrawal_reason: string;
  withdrawal_date: string;
  license_expires_in_days: number;
}

export interface License {
  id: string;
  external_reference_id: string;
  license_type: string;
  license_start: string;
  license_end: string;
}

export interface ProfessionalDetails {
  professional_cadre: string;
  practice_type: string;
  specialty: string;
  subspecialty: string;
  discipline_name: string;
  educational_qualifications: string;
}

export interface Contacts {
  phone: string;
  email: string;
  postal_address: string;
}

export interface Identifiers {
  identification_type: string;
  identification_number: string;
  client_registry_id: string;
  student_id: string;
}

export enum Regulators {
  Ppb = 'ppb',
  Nck = 'nck',
  Coc = 'coc',
  Kmpdc = 'kmpdc',
}
