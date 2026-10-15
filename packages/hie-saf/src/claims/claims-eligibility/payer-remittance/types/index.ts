export interface FhirCoding {
  system?: string;
  code?: string;
  display?: string;
}

export interface FhirCodeableConcept {
  coding?: FhirCoding[];
}

export interface FhirIdentifier {
  use?: string;
  system?: string;
  value?: string;
}

export interface FhirMeta {
  versionId?: string;
  lastUpdated?: string;
  tag?: FhirCoding[];
}

export interface FhirReference {
  reference?: string;
  display?: string;
}

export interface FhirMoney {
  value?: number;
  currency?: string;
}

export interface FhirExtension {
  url: string;
  valueDate?: string;
  valueMoney?: FhirMoney;
}

export interface FhirDetail {
  extension?: FhirExtension[];
  identifier?: {
    system?: string;
    value?: string;
  };
  type?: FhirCodeableConcept;
  amount?: FhirMoney;
  request?: FhirReference;
}

export interface PaymentReconciliationResource {
  resourceType: 'PaymentReconciliation';
  id: string;
  meta?: FhirMeta;
  identifier?: FhirIdentifier | FhirIdentifier[];
  status: string;
  created: string;
  paymentIssuer?: FhirReference;
  requestor?: FhirReference;
  disposition?: string;
  paymentAmount?: FhirMoney;
  paymentIdentifier?: {
    system?: string;
  };
  detail?: FhirDetail[];
}

export interface PaymentNoticeResource {
  resourceType: 'PaymentNotice';
  id: string;
  meta?: FhirMeta;
  identifier?: FhirIdentifier[];
  status: string;
  created: string;
  provider?: FhirReference;
  payment?: FhirReference;
  payee?: FhirReference;
  recipient?: FhirReference;
  amount?: FhirMoney;
  paymentStatus?: FhirCodeableConcept;
}

export type BundleEntryResource =
  PaymentReconciliationResource | PaymentNoticeResource;

export interface BundleEntry {
  resource: BundleEntryResource;
}

export interface ReconciliationBundle {
  resourceType: 'Bundle';
  id: string;
  meta?: FhirMeta;
  identifier?: FhirIdentifier;
  type: string;
  entry: BundleEntry[];
}

export type PayerRemittanceIssue = {
  severity: string;
  code: string;
  text: string;
  diagnostics: string;
};
export type PayerRemittanceOutcome = {
  id: string;
  issues?: PayerRemittanceIssue[];
};
export type PayerRemittanceReponse = {
  type: string;
  payment_notices: any[];
  payment_reconciliations: any[];
  operation_outcomes: PayerRemittanceOutcome[];
};
