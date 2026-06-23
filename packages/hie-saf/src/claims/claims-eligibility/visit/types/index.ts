export enum ServiceType {
  Capitation = 'CAPITATION',
  Outpatient = 'OUTPATIENT',
  Inpatient = 'INPATIENT',
  Emergency = 'EMERGENCY',
}

export type ClaimVisitDto = {
  intervention_codes: string;
  otp: string;
  patient_id: string;
  service_type: ServiceType;
};

export type ClaimVisitInvoince = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  dispatch_status: string;
  workflow_state: string;
  created_by_name: string;
  patient_name: string;
  patient_number: string;
  provider_name: string;
  scheme_code: string;
  scheme_name: string;
  service_type: string;
  total_inv_amount: string;
  total_inv_net_amount: string;
  total_inv_copay: string;
  total_inv_discount: string;
  lines: any[];
  doctors: any[];
  invoice_flags: any[];
  visit_start: string;
};

export type VisitIntervention = {
  id: string;
  intervention_code: string;
  intervention_name: string;
  intervention_payment_mechanism: string;
  keph_level_tarrif: string;
  accrued_per_diem_amount: string;
  accrued_per_diem_days: number;
  workflow_state: string;
  preauth_exist: boolean;
  is_switched_intervention: boolean;
  supported_scheme: string;
  switched_lines_retained: boolean;
  sub_benefit_code: string;
  active_for_uhc: boolean;
  intervention_fund: string;
  requires_surgical_preauth: boolean;
  requires_renal_preauth: boolean;
  requires_oncology_preauth: boolean;
  requires_radiology_preauth: boolean;
  requires_optical_preauth: boolean;
  optional_document_type: unknown;
  required_preauth_document_types: unknown;
  optional_preauth_document_types: unknown;
  applicable_document_types: any[];
  needs_preauth: boolean;
};

export type ClaimsVisitReponse = {
  id: string;
  payer_code: string;
  payer_name: string;
  provider_slade_code: string;
  provider_name: string;
  patient_name: string;
  patient_number: string;
  member_number: string;
  member_number_has_token: boolean;
  service_type: string;
  scheme_code: string;
  scheme_name: string;
  currency: string;
  visit_number: string;
  visit_start: string;
  authorization_code: string;
  authorization_guid: string;
  beneficiary_id: number;
  beneficiary_guid: string;
  beneficiary_is_fuzzy_matched: boolean;
  workflow_state: string;
  is_charge_master_mapped: boolean;
  is_resubmitted: boolean;
  is_negative: boolean;
  is_zero: boolean;
  has_reviewed_claim: boolean;
  initial_intervention: string;
  interventions: VisitIntervention[];
  invoices: ClaimVisitInvoince[];
  claim_attachments_count: number;
  claim_auth_status: string;
  claim_diagnoses: any[];
  diagnoses_count: number;
  invoice_attachments_count: number;
  invoice_id: string;
  invoice_number: string;
  number_of_invoices: number;
  total_claim_amount: string;
  total_claim_copay: string;
  total_claim_discount: string;
  total_claim_net_amount: string;
  total_claim_splits: string;
  retry_count: number;
  created_by_name: string;
  updated_by_name: string;
  notes: string;
};
