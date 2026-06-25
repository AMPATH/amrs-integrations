export type BiometricsAuthorizationDto = {
  agent_id: string;
  authorizing_device_os: string;
  ekyc_provider_id: string;
  factors: string[];
  interventions: string[];
  is_biometrics_discharge_authorization: boolean;
  is_emergency: boolean;
  is_integration: boolean;
  patient_id: string;
  provider: string;
  service_type: string;
  work_station_id: string;
};

export type BiometricsAuthorizationResponse = {
  id: number;
  beneficiary: number;
  authorizationType: string[];
  benefitType: string;
  provider: number;
  ekycToken?: string;
  authorizingDeviceOs?: string;
  workStationId?: string;
  shaGuid?: string;
  shaVerificationRequestId?: string;
  shaVerificationRequest?: {
    embedExpiry: number;
    embededToken: string;
    requestId: string;
    requestUrl: string;
  };
  status: string;
  authCode: string;
  token: string;
  guid: string;
  expiry: string;
  isOpen: boolean;
  isComplete: boolean;
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
