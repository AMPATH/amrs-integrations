export type ClaimDischargeDto = {
  consent_token: string;
  discharge_date: string;
  discharge_reason: string;
  invoice_number: string;
  discharge_auth_guid?: string;
  otp?: string;
  notes: string;
  date_of_death?: string;
  death_notification_serial_number?: string;
};
