export interface IdMappings {
  patientMap: Map<string, string>; // localPatientId -> shrPatientId
  practitionerMap: Map<string, string>; // localPractitionerId -> shrPractitionerId
  organizationMap: Map<string, string>; // localOrgId -> shrOrganizationId
}

export interface PatientData {
  patient: any;
  encounters: any[];
  observations: any[];
  observationsByEncounter: Record<string, any[]>;
  // observationsByEncounter: any[], // for rev
  medicationRequests: any[];
  dateContext: string;
}
