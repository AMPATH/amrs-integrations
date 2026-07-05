export type AddClaimLineDto = {
  consent_token: string;
  intervention_code: string;
  service_name: string;
  service_identifier: string;
  unit_price: string;
  quantity: string;
  scheme_code: string;
};

export type RemoveClaimLineDto = {
  consent_token: string;
  line_guid: string;
};

export enum ClaimLineActions {
  Add = 'ADD',
  Remove = 'REMOVE',
}
