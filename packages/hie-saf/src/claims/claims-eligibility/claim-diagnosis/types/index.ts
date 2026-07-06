export type AddClaimDiagnosisDto = {
  consent_token: string;
  icd_code: string;
  intervention_code: string;
  practitioner_identification_number: string;
  practitioner_identification_type: string;
  practitioner_regulation_body: string;
};

export type RemoveClaimDiagnosisDto = {
  consent_token: string;
  icd_code: string;
  intervention_code: string;
};

export enum DiagnosisActions {
  Add = 'ADD',
  Remove = 'REMOVE',
}
