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

export interface EncodedFhirResponse {
  data: string; // base64-encoded FHIR bundle
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
  BIRTH_CERTIFICATE = "Birth Certificate",
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
  locationUuid: string;
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

export enum FacilityFilterType {
  facilityCode = "facilityCode",
  registrationNumber = "registrationNumber",
}

export interface FacilityFilterDto {
  filterType: FacilityFilterType;
  filterValue: string;
  locationUuid: string;
}
export interface HieFacilityFilteSearchrDto {
  registration_number?: string;
  facility_code?: string;
}

export type BeneficiaryTokenResponse = {
  accessToken: string;
  refreshToken: string;
};

export type EligibilityFilterDto = {
  requestIdType: string;
  requestIdNumber: string;
  locationUuid: string;
};

export type EligibilityDto = {
  requestIdType: string;
  requestIdNumber: string;
};

export type EligibilityResponse = {
  requestIdType: number;
  requestIdNumber: string;
  memberCrNumber: string;
  fullName: string;
  schemes: Scheme[];
};

export type Scheme = {
  memberType: "BENEFICIARY" | string;
  coverageType: "SHIF" | string;
  policy: Policy;
  coverage: Coverage;
  principalContributor: PrincipalContributor;
};

export type Policy = {
  startDate: string;
  endDate: string;
  number: string;
};

export type Coverage = {
  startDate: string;
  endDate: string;
  message: string;
  reason: string;
  possibleSolution: string | null;
  status: string;
};

export type PrincipalContributor = {
  idNumber: string;
  name: string;
  crNumber: string;
  relationship: string;
  employmentType: string;
  employerDetails: EmployerDetails;
};

export type EmployerDetails = {
  name: string;
  jobGroup: string;
};

export enum RequestIdTypes {
  BirthCertificate = 2,
  CrId = 3,
  NationalId = 4,
  Refugee = 5,
  TemporaryId = 6,
  TempDependantId = 7,
  MandateNo = 8,
  Passport = 9,
  BirthCertificate2 = 10,
  HouseholdNumber = 11,
}
