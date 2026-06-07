import { ConsentScope } from '../../client-registry/types';

export enum IdentifierTypes {
  TemporaryID = 'Temporary ID',
  AlienID = 'Alien ID',
  RefugeeID = 'Refugee ID',
  MandateNumber = 'Mandate Number',
  BirthCertificate = 'Birth Certificate',
  NationalID = 'National ID',
  BirthNotification = 'Birth Notification',
  CRID = 'CR ID',
}

export const IdentificationTypesMap: { [key: string]: string } = {
  '2': IdentifierTypes.NationalID,
  '3': IdentifierTypes.CRID,
};

export enum FacilityIdentifierTypes {
  FacilityRegistryCode = 'fr-code',
  RegulatorLicenseNumber = 'license-number',
  RegistrationNumber = 'registration-number',
  SHALicenseNumber = 'sha-license-number',
}

export const FacilityIdentificationTypesMap: { [key: string]: string } = {
  facilityCode: FacilityIdentifierTypes.RegistrationNumber,
  registrationNumber: FacilityIdentifierTypes.RegistrationNumber,
};

export type RequestOtpApiResponse = {
  status: string;
  message: string;
  id: string;
  error?: string;
};
export type TiberbuRequestOtpApiResponse = {
  message: string;
  sessionId: string;
  maskedPhone: string;
};
export type ValidateConsentApiResponse =
  | ValidateConsentApiSuccessResponse
  | ValidateConsentApiErrorResponse;
export type ValidateConsentApiSuccessResponse = {
  token: string;
  issued: number;
  expires: number;
  status: string;
  expires_in: number;
};
export type ValidateConsentApiErrorResponse = {
  errorResponse: {
    requestId: string;
    code: string;
    message: string;
    info: string;
    timestamp: string;
  };
};
export type TiberbuValidateConsentApiResponse = {
  data: {
    identification_type: string;
    identification_number: string;
    status: 'valid' | 'invalid';
  };
};

export type ConsentDto = {
  identifierType: string;
  identifierNumber: string;
  phoneNumber: string;
  facility: string;
  scope: ConsentScope[];
};
