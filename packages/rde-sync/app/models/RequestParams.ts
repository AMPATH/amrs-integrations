export interface QueuePatientPayload {
  patientIds: number[];
  userId: number;
  reportingMonth: string;
}

export interface RDEQueuePayload {
  identifiers: string[];
  userId: number;
  reportingMonth: string;
}
