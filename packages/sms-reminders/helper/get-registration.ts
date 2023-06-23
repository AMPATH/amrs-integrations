import{
    Registration
    /*
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
    */
}
from '../models/registration';
import example from '../models/example.registration_payload.json'

export const getRegistration = async (params:any) => {
    console.log(params);
    const payload: Registration = example;
    console.log(JSON.stringify(payload));
    return payload;
}