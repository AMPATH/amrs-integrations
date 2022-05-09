declare module PatientPayload {

    export interface PatientIdentifier {
        identifier: string;
        identifierType: string;
        location: string;
        preferred: boolean;
    }
    export interface Residence {
        County: string;
        SubCounty: string;
        Ward: string;
        Village: string;
        LandMark: string;
        Address: string;
    }

    export interface Identification {
        IdentificationType: string;
        IdentificationNumber: string;
    }

    export interface Contact {
        PrimaryPhone: string;
        SecondaryPhone: string;
        EmailAddress: string;
    }
    export interface NextOfKin {
        Name: string;
        Relationship: string;
        Residence: string;
        Contact: Contact;
    }

    export interface Patient {
        uuid: string;
        ClientNumber: string;
        FirstName: string;
        MiddleName: string;
        LastName: string;
        DateOfBirth: string;
        MaritalStatus: string;
        Gender: string;
        Occupation: string;
        Religion: string;
        EducationLevel: string;
        Country: string;
        CountyOfBirth: string;
        Residence: Residence;
        Identifications: Identification[];
        Contact: Contact;
        NextOfKins: NextOfKin[];
        OriginFacilityKmflCode: string;
        IsAlive : boolean;

    }
}