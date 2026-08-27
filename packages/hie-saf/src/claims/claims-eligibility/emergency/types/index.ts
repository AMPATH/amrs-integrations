export type CreateEmergencyUnidentifiedClaimDto = {
  interventions: string[];
  mode_of_arrival: string;
  brought_by: string;
  reference_number: string;
  identification_number: string;
  identification_type: string;
  regulation_body: string;
  notes?: string;
};

export type CreateEmergencyIdentifiedClaimDto = {
  interventions: string[];
  mode_of_arrival: string;
  brought_by: string;
  reference_number: string;
  beneficiary_cr_id: string;
  identification_number: string;
  identification_type: string;
  regulation_body: string;
  notes?: string;
};

export type SubmitUnIdentifiedClaimDto = {
  consent_token: string;
  invoice_number: string;
  reason_for_unknown_patient: string;
};

export type IdentifyUknownEmergencyCaseDto = {
  interventions: string[];
  mode_of_arrival: string;
  brought_by: string;
  reference_number: string;
  identification_number: string;
  identification_type: string;
  regulation_body: string;
  notes?: string;
  beneficiary_cr_id: string;
  beneficiary_contact_id?: string;
  otp: string;
  consent_token: string;
};

export type AddEmergencyClaimDoctorDto = {
  consent_token: string;
  identification_number: string;
  identification_type: string;
  regulation_body: string;
};

export type RemoveEmergencyClaimDoctorDto = {
  consent_token: string;
};
