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
     * 1). Pull patient registration data from DB
     * 2). Populate the payload
     * 3). return the payload for consumption
     */
 
    const payload: Registration = example;
    const currentRegistrations: any[] = [payload]; //all registrations pulled by this time

    return payload;
}