export interface MemberEligibilityResponse {
  requestIdType: number;
  requestIdNumber: string;
  memberCrNumber: string;
  fullName: string;
  statusCode: string;
  statusDesc: string;
  schemes: Scheme[];
}

export interface ClaimsMemberEligibilityResponse {
  requestIdType: number;
  requestIdNumber: string;
  dateOfBirth: string;
  gender: string;
  age: number;
  whitelistedForOTP: boolean;
  facilityBiometricsEnforced: boolean;
  memberCrNumber: string;
  fullName: string;
  statusCode: string;
  statusDesc: string;
  schemes: Scheme[];
}

export interface Scheme {
  schemeName: string;
  schemeId: number;
  memberType: 'PRIMARY' | 'BENEFICIARY';
  policy: Policy;
  coverage: Coverage;
  principalContributor: PrincipalContributor;
  beneficiaryOf: Scheme[] | null;
}

export interface Policy {
  startDate: string;
  endDate: string;
  number: string;
}

export interface Coverage {
  startDate: string;
  endDate: string;
  message: string;
  reason: string;
  possibleSolution: string | null;
  status: string;
}

export interface PrincipalContributor {
  idNumber: string;
  idType: string;
  crNumber: string;
  name: string;
  relationship: string | null;
  employmentType: string;
  employerDetails: EmployerDetails;
}

export interface EmployerDetails {
  name: string;
  jobGroup: string | null;
}
