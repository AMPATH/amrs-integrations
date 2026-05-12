export interface Facility {
  registrationNumber: string;
  frCode: string;
  regulatoryOperationalStatus: OperationalStatus;
  SHAOperationStatus: OperationalStatus;
  facilityLicenseStatus: string;
  licenseNumber: string;
  facilityLicenseStartDate: string;
  facilityLicenseEndDate: string;
  regulatoryBody: string;
  shaContractStatus: string;
  shaConstractStartDate: string | null;
  shaConstractEndDate: string | null;
  officialName: string;
  kephLevel: string;
  fidCode: string;
  facilityOwnership: string;
  facilityType: string;
  pcnCode: string | null;
  isHub: boolean;
  facilityContacts: string | null;
  facilityPhoneNumber: string;
  facilityEmail: string;
  facilityAdministratorName: string;
  facilityAdministratorEmail: string;
  facilityAdministratorPhone: string;
  facilityAdministratorIdentifier: string;
  facilityAgent: string;
  address: Address;
  uuid: string | null;
  bedOccupancy: BedOccupancy;
  shaContractedServices: ShaContractedService[];
  approvedServices: ApprovedService[];
  linkedFacilities: string | null;
}

export interface OperationalStatus {
  operationalStatus: string;
  operationalStatusReason: string;
  suspensionReason: string;
  suspensionDate: string | null;
  reinstatementRecommendations: string;
  earliestReinstatementDate: string;
  reinstatementDate: string | null;
}

export interface Address {
  country: string;
  countyCode: string;
  county: string;
  subCountyCode: string | null;
  subCounty: string;
  ward: string | null;
  postalAddress: string;
  physicalLocation: string;
  roadStreet: string | null;
  plotNumber: string | null;
  prominentLandmark: string | null;
  town: string;
  constituency: string | null;
  latitude: string;
  longitude: string;
}

export interface BedOccupancy {
  totalBeds: number;
  normalBeds: number;
  icuBeds: number;
  hduBeds: number;
  dialysisBeds: number;
  numberOfCots: number;
}

export interface ApprovedService {
  serviceCode: string;
  serviceName: string;
  serviceStatus: boolean;
  effectiveStart: string;
  effectiveEnd: string | null;
}

export interface ShaContractedService {
  [key: string]: unknown;
}

export type FacilitiesResponse = Facility[];
