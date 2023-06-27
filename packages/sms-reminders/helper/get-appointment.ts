import {
    Appointment,
    MessageHeader,
    PatientIdentification,
    ExternalPatientId,
    InternalPatientId,
    PatientName,
    MotherName,
    PatientAddress,
    PhysicalAddress,
    AppointmentInformation,
    PlacerAppointmentNumber
}
from '../models/appointment';
import example from '../models/example.appointment_payload.json';

export async function getAppointment(params: any){
    /**
     * 1). the recent entry client data is posted for appointment 
     * 2). 
     */
    const payload: Appointment = example;
    return payload;
}