// FHIR Patient Resource
export interface HiePatient {
  resourceType: string;
  id: string;
  identifier: Array<{
    use?: string;
    type: {
      coding: Array<{
        system: string;
        code: string;
        display: string;
      }>;
    };
    value: string;
  }>;
  active: boolean;
  name: Array<{
    text?: string;
    family: string;
    given: string[];
  }>;
  telecom?: Array<{
    system: string;
    value: string;
  }>;
  gender: string;
  birthDate: string;
  address?: Array<{
    extension?: Array<{
      url: string;
      valueString?: string;
    }>;
    city?: string;
    country?: string;
  }>;
  extension?: Array<{
    url: string;
    valueString?: string;
  }>;
}

// FHIR Practitioner Resource
export interface HiePractitioner {
  resourceType: string;
  id: string;
  identifier: Array<{
    type?: {
      coding: Array<{
        system: string;
        code: string;
        display: string;
      }>;
    };
    value: string;
    period?: {
      start: string;
      end: string;
    };
  }>;
  active: boolean;
  name: Array<{
    text?: string;
  }>;
  telecom?: Array<{
    system: string;
    value: string;
  }>;
  gender: string;
  qualification?: Array<{
    extension?: Array<{
      url: string;
      valueString?: string;
      valueCodeableConcept?: {
        coding: Array<{
          system: string;
          code: string;
          display: string;
        }>;
      };
    }>;
    code?: {
      coding: Array<{
        system: string;
        code: string;
        display: string;
      }>;
    };
    period?: {
      start: string;
      end: string;
    };
  }>;
}

// FHIR Bundle Response
export interface FhirBundle<T> {
  resourceType: "Bundle";
  id: string;
  meta: {
    lastUpdated: string;
  };
  type: "searchset";
  total: number;
  link: Array<{
    relation: string;
    url: string;
  }>;
  entry: Array<{
    resource: T;
  }>;
}