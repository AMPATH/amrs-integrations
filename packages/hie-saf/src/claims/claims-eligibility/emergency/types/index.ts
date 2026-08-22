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
