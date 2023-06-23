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

export async function getAppointment(){
    const payload: Appointment = example;
    return payload;
}