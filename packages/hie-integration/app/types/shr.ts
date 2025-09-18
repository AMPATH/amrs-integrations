// Simplified TypeScript interfaces for the FHIR Bundle

export interface FhirBundle {
  id: string;
  type: string;
  resourceType: "Bundle";
  timestamp: string;
  entry: FhirBundleEntry[];
}

export type FhirBundleEntry = {
  resource: FhirResource;
  request: FhirRequest;
  patient?: string; // for ObservationResource entries that include patient
};

export type FhirResource =
  | EncounterResource
  | CompositionResource
  | MedicationRequestResource
  | ObservationResource;

export interface FhirRequest {
  method: string;
  url: string;
}

export interface Coding {
  system: string;
  code: string;
  display: string;
}

export interface ReferenceWithIdentifier {
  reference: string;
  identifier: { system: string; value: string }[];
}

export interface EncounterResource {
  resourceType: "Encounter";
  id: string;
  identifier: { system: string; value: string }[];
  status: string;
  class: Coding;
  type: { coding: Coding[] }[];
  priority: { coding: Coding[] };
  period: { start: string; end: string };
  subject: ReferenceWithIdentifier;
  participant: {
    reference: string;
    individual: { identifier: { system: string; value: string }[] };
  }[];
  serviceProvider: {
    reference: string;
    identifier: { system: string; value: string }[];
  };
}

export interface CompositionResource {
  resourceType: "Composition";
  id: string;
  status: string;
  type: { coding: Coding[]; text: string };
  category: { coding: Coding[] }[];
  subject: ReferenceWithIdentifier;
  encounter: { reference: string };
  date: string;
  author: { provider: { individual: ReferenceWithIdentifier } }[];
  title: string;
  section: CompositionSection[];
}

export interface CompositionSection {
  title: string;
  code: { coding: Coding[] };
  text: { status: string; display: string };
}

export interface MedicationRequestResource {
  resourceType: "MedicationRequest";
  id: string;
  meta: { profile: string[] };
  identifier: { use: string; system: string; value: string }[];
  status: string;
  intent: string;
  priority: string;
  medicationCodeableConcept: { coding: Coding[]; text: string }[];
  requester: {
    reference: string;
    type: string;
    identifier: { system: string; value: string }[];
  };
  subject: {
    reference: string;
    type: string;
    identifier: { use: string; system: string; value: string };
  };
  authoredOn: string;
  dosageInstruction: DosageInstruction[];
  dispenseRequest: {
    validityPeriod: { start: string };
    numberOfRepeatsAllowed: number;
    quantity: { value: number; unit: string; code: string };
  };
  note: { authorString: string; time: string; text: string }[];
}

export interface DosageInstruction {
  text: string;
  timing: {
    repeat: { duration: string; durationUnit: string };
    code: {
      coding: { system: string; code: string; display: string | number }[];
      text: string | number;
    };
  };
  asNeededBoolean: boolean;
  route: { coding: Coding[]; text: string };
  doseAndRate: {
    doseQuantity: { value: number; unit: string; code: string };
  }[];
}

export interface ObservationResource {
  resourceType: "Observation";
  id: string;
  status: string;
  category: { coding: Coding[] }[];
  code: { coding: Coding[] };
  identifier: { use: string; system: string; value: string };
  subject: {
    reference: string;
    type: string;
    identifier: { use: string; system: string; value: string };
  };
  performer: {
    reference: string;
    identifier: { system: string; value: string }[];
  };
  effectiveDateTime: string;
  valueString: string | boolean;
}