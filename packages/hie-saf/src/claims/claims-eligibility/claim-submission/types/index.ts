export type SubmitClaimDto = {
  consent_token: string;
  invoice_number: string;
  otp?: string;
  discharge_auth_guid?: string;
  discharge_reason: string;
  notes: string;
};
