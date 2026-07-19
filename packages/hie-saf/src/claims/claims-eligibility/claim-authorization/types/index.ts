export type ClaimAuthorizationsResponse = {
  id: number;
  beneficiary: number;
  authorizationType: string[];
  benefitType: string;
  provider: number;
  ekycToken: string;
  authorizingDeviceOs: string;
  workStationId: string;
  status: string;
  shaGuid: string;
  shaVerificationRequestId: string;
  shaVerificationRequest: {
    embedExpiry: number;
    embededToken: string;
    requestId: string;
    requestUrl: string;
  };
  authCode: string;
  token: string;
  guid: string;
  expiry: string;
  isOpen: boolean;
  label: string;
  providerName: string;
  providerFid: string;
  beneficiaryName: string;
  beneficiaryNumber: string;
  beneficiaryCode: string;
  beneficiaryScheme: string;
  beneficiaryJoinDate: string;
  overallPreauthFinalised: boolean;
};

export type CancelPendingAuthorizationDto = {
  consentToken: string;
};
