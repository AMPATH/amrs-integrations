export type CreateOtpWhitelistReponse = {
  reasonType: string;
  reason: string;
  reviewedByUser: string;
  status: string;
  guid: string;
  beneficiaryCrId: string;
  beneficiaryName: string;
  facilityName: string;
  facilityFrCode: string;
  reviewerResponseNotes: any[];
  attachments: WhiteListAttachment[];
};

export type WhiteListAttachment = {
  guid: string;
  uploadedFile: string;
  description: string;
  contentType: string;
};
