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
