export type RemoveClaimAttachmentDto = {
  attachment_id: string;
  consent_token: string;
  intervention_code: string;
};
export enum ClaimAttachmentActions {
  Add = 'ADD',
  Remove = 'REMOVE',
}

export type AddClaimAttachmentReponse = {
  id: string;
  title: string;
  data: string;
  attachment_type: string;
  retry_count: number;
  intervention_code: string;
  claim: string;
  attachment: string;
};
