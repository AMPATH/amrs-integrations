import{
    Registration,
    MessageHeader,
    PatientIdentification,
    ExternalPatientId,
    PatientName,
    MotherName,
    PatientAddress,
    PhysicalAddress,
    NextOfKin,
    NokName,
    PatientVisit,
    ObservationResult
}
from '../models/registration';
import example from '../models/example.registration_payload.json'
import { Patient } from '../models/patient';

export const getRegistration = async (param: Patient) => {
    /**
     * 1). Query the DBs for columns required in the payload
     * 2). populate the payload
     * 3). Return the payload
     */
    //scenarios: If it is a ne client
    /*
    a). The client registration payload is build
    */
 
    const payload: Registration = example;
    const currentRegistrations: any[] = [payload]; //all registrations pulled by this time

    return payload;
}