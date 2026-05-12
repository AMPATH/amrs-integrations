export interface CRPatient {
  resourceType: string;
  id: string;
  meta: Meta;
  originSystem: OriginSystem;
  identity_verified: number;
  title: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  gender: string;
  date_of_birth: string;
  place_of_birth: string;
  person_with_disability: number;
  disability_certificate_no: string;
  citizenship: string;
  kra_pin: string;
  preferred_primary_care_network: string;
  employment_type: string;
  domestic_worker_type: string;
  civil_status: string;
  identification_type: string;
  identification_number: string;
  other_identifications: OtherIdentification[];
  dependants: DependantGroup[];
  is_alive: number;
  deceased_datetime: string;
  phone: string;
  biometrics_verified: number;
  biometrics_score: number;
  email: string;
  country: string;
  county: string;
  sub_county: string;
  ward: string;
  village_estate: string;
  building_house_no: string;
  latitude: string;
  longitude: string;
  province_state_country: string;
  zip_code: string;
  identification_residence: string;
  employer_name: string;
  employer_pin: string;
  disability_category: string;
  disability_subcategory: string;
  disability_cause: string;
  in_lawful_custody: string;
  admission_remand_number: string;
  document_uploads: unknown[];
  alternative_contacts: unknown[];
  gross_income: number;
  gross_income_currency: string;
  postal_address: string;
  estimated_contribution: number;
  estimated_annual_contribution: number;
  city: string;
  id_serial: string;
  learning_institution_code: string;
  learning_institution_name: string;
  grade_level: string;
  admission_number: string;
  expected_year_of_graduation: string;
  unconfirmed_dependants: unknown[];
  is_agent: number;
  agent_id: string;
}

export interface Meta {
  versionId: string;
  creationTime: string;
  lastUpdated: string;
  source: string;
}

export interface OriginSystem {
  system: string;
  record_id: string;
}

export interface OtherIdentification {
  identification_type: string;
  identification_number: string;
}

export interface DependantGroup {
  date_added: string;
  relationship: string;
  total: number;
  result: CRPatient[];
}

export type SearchClientRequestParams = {
  identificationNumber: string;
  identificationType: string;
  locationUuid: string;
};
export type CRPatientApiResponse = {
  message?: {
    total: number;
    result: CRPatient[];
  };
  responseCode?: string;
  errorCode?: number;
};

export enum ConsentScope {
  ClientRegistry = 'CLIENT_REGISTRY',
  SharedHealthRecords = 'SHARED_HEALTH_RECORD',
}
