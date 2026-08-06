export type PreAuthRequestItem = {
  unitPrice: string;
};
export type PreAuthDiagnosisRequest = {
  consentToken: string;
  icdCode: string;
};
export type PreAuthDoctorRequest = {
  identificationNumber: string;
  identificatioType: string;
  regulationBody: string;
  interventionCode: string;
  isPrimary: boolean;
};

export type PreAuthAttachmentRequest = {
  documentTitle: string;
  documentType: string;
  fileFieldName: string;
};

export type PreAuthItem = {
  unit_price: string;
};
export type PreAuthDiagnosis = {
  consent_token: string;
  icd_code: string;
};
export type PreAuthDoctor = {
  identification_number: string;
  identification_type: string;
  regulation_body: string;
  intervention_code: string;
  is_primary: boolean;
};

export type PreAuthAttachment = {
  document_title: string;
  document_type: string;
  file_field_name: string;
};

export type PreAuthPreviewDto = {
  consent_token: string;
};

/** Multer uploaded file shape (avoid Express.Multer namespace typing issues). */
export type UploadedPreauthFile = {
  fieldname: string;
  originalname: string;
  encoding?: string;
  mimetype: string;
  size?: number;
  buffer: Buffer;
};

export type CancelPreAuthDto = {
  consent_token: string;
  intervention_code: string;
};
