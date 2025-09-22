// FHIR Patient Resource
export interface HiePatient {
  resourceType: string;
  id: string;
  identifier: Array<{
    use?: string;
    type: {
      coding: Array<{
        system: string;
        code: string;
        display: string;
      }>;
    };
    value: string;
  }>;
  active: boolean;
  name: Array<{
    text?: string;
    family: string;
    given: string[];
  }>;
  telecom?: Array<{
    system: string;
    value: string;
  }>;
  gender: string;
  birthDate: string;
  address?: Array<{
    extension?: Array<{
      url: string;
      valueString?: string;
    }>;
    city?: string;
    country?: string;
  }>;
  extension?: Array<{
    url: string;
    valueString?: string;
  }>;
}

// FHIR Practitioner Resource
export interface HiePractitioner {
  resourceType: string;
  id: string;
  identifier: Array<{
    type?: {
      coding: Array<{
        system: string;
        code: string;
        display: string;
      }>;
    };
    value: string;
    period?: {
      start: string;
      end: string;
    };
  }>;
  active: boolean;
  name: Array<{
    text?: string;
  }>;
  telecom?: Array<{
    system: string;
    value: string;
  }>;
  gender: string;
  qualification?: Array<{
    extension?: Array<{
      url: string;
      valueString?: string;
      valueCodeableConcept?: {
        coding: Array<{
          system: string;
          code: string;
          display: string;
        }>;
      };
    }>;
    code?: {
      coding: Array<{
        system: string;
        code: string;
        display: string;
      }>;
    };
    period?: {
      start: string;
      end: string;
    };
  }>;
}

// FHIR Bundle Response
export interface FhirBundle<T> {
  resourceType: "Bundle";
  id: string;
  meta: {
    lastUpdated: string;
  };
  type: "searchset";
  total: number;
  link: Array<{
    relation: string;
    url: string;
  }>;
  entry: Array<{
    resource: T;
  }>;
}

export type EncryptedClientResp = {
  message: {
    total: number;
    result: { _pii: string }[];
  };
};

export enum IdentifierType {
  NATIONAL_ID = "National ID",
  ALIEN_ID = "Alien ID",
  PASSPORT = "passport",
  MANDATE_NUMBER = "Mandate Number",
  REFUGEE_ID = "Refugee ID",
  REGISTRATION_NUMBER = "registration_number",
  LICENSE_NO = "id",
}


export interface Identifier {
  type: IdentifierType;
  value: string;
}

export interface PatientSearchPayload {
  identificationNumber: string;
  identificationType: IdentifierType;
  sessionId?: string;
  otp?: string;
  skipOtp?: boolean;
}

export interface PractitionerRegistryResponse {
  message: {
    registrationNumber: number;   
    found: number;              
    isActive: boolean;            
    name?: string;               
    specialization?: string;     
    licenseStatus?: string;      
  };
}


export interface FacilitySearchResponse {
  message: {
    facility_code: string;
    found: number;
    approved: string | null;
    facility_level: string | null;
    operational_status: string | null;
    current_license_expiry_date: string;
  };
}
