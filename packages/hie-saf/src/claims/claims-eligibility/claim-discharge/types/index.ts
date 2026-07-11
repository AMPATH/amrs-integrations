export type ClaimDischargeDto = {
  consent_token: string;
  discharge_date: string;
  discharge_reason: string;
  invoice_number: string;
  discharge_auth_guid?: string;
  otp?: string;
  notes: string;
};
