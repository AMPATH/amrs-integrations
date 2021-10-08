import ADTRESTClient from "../loaders/ADT-rest-client";
import PatientService from "../services/patient";
import { EventSubscriber, On } from "event-dispatch";
import { HTTPResponse } from "../interfaces/response";
import { loadProviderData } from "../models/patient";
import PrescriptionService from "../services/prescription";
import RegimenLoader from "../loaders/regimen-mapper";
@EventSubscriber()
export default class PatientSubscriber {
  @On("search")
  public onPatientSearch({ patient, MFLCode }: any) {
    console.log("Search event has reached here", MFLCode);
    const data = new ADTRESTClient("");
    const prescriptionService = new PrescriptionService();
    const patientService = new PatientService();
    data.axios
      .get("/patients/" + patient[0].patient_ccc_number?.replace("-", ""), {
        params: {
          mflcode: MFLCode,
          identifier: "ccc",
          ccc: patient,
        },
      })
      .then(async (resp: any) => {
        let result: Patient.Patient[] = resp;
        if (result[0]?.patient_number_ccc) {
          await prescriptionService.createAMRSOrder(
            patient,
            MFLCode,
            patient[0].patient_ccc_number
          );
        } else {
          await patientService.createPatientOnADT(patient, MFLCode);
        }
      })
      .catch(
        (error: {
          response: { data: any; status: any; headers: any };
          request: any;
          message: any;
          config: any;
        }) => {
          // Error 😨
          if (error.response) {
            /*
             * The request was made and the server responded with a
             * status code that falls out of the range of 2xx
             */
            console.log(error.response.data);
            console.log(error.response.status);
            console.log(error.response.headers);
          } else if (error.request) {
            /*
             * The request was made but no response was received, `error.request`
             * is an instance of XMLHttpRequest in the browser and an instance
             * of http.ClientRequest in Node.js
             */
            console.log(error.request);
          } else {
            // Something happened in setting up the request and triggered an Error
            console.log("Error", error.message);
          }
          console.log(error.config);
        }
      );
  }
  @On("createPatient")
  public onPatientCreate({ patient, mflcode }: any) {
    let patients: Patient.Patient = patient[0];
    console.log("create patient event ", patients.patient_ccc_number);
    const regimenLoader = new RegimenLoader();
    const regimen = regimenLoader.getRegimenCode(patients.start_regimen)[0];
    let payload = {
      source: patients.source ? patients.source : "OUTPATIENT",
      medical_record_no: patients.medical_record_no,
      patient_number_ccc: patients.patient_ccc_number.replace("-", ""),
      first_name: patients.first_name,
      last_name: patients.last_name,
      other_name: patients.other_name,
      date_of_birth: new Date(patients.date_of_birth).toISOString(),
      place_of_birth: patients.place_of_birth,
      gender: patients.gender,
      pregnant: patients.gender ? patients.gender : "",
      breastfeeding: patients.breastfeeding ? patients.breastfeeding : "",
      weight: patients.weight ? patients.weight.toString() : 0,
      height: patients.height ? patients.height.toString() : 0,
      start_regimen: regimen,
      start_regimen_date: new Date(
        patients.start_regimen_date
      ).toLocaleDateString(),
      enrollment_date: patients.enrollment_date,
      phone: patients.phone,
      address: patients.address,
      partner_status: "Unknown",
      family_planning: patients.family_planning ? patients.family_planning : "",
      alcohol: patients.alcohol ? patients.alcohol : "",
      smoke: patients.smoke ? patients.smoke : "",
      current_status: 1,
      service: patients.service,
      mfl_code: mflcode,
      who_stage: 1,
      prep: {
        prep_reason: "test",
      },
      pep: {
        pep_reason: "test",
      },
    };
    console.log(payload);
    const data = new ADTRESTClient("");
    const prescriptionService = new PrescriptionService();
    data.axios
      .post("/patient", payload)
      .then(async (resp: HTTPResponse) => {
        console.log(resp.message);
        if (resp.code === 200) {
          //Publish event with payload and error that occurred
          await prescriptionService.createAMRSOrder(
            patient,
            mflcode,
            patients.patient_ccc_number
          );
        } else {
        }
      })
      .catch(
        (error: {
          response: { data: any; status: any; headers: any };
          request: any;
          message: any;
          config: any;
        }) => {
          // Error 😨
          if (error.response) {
            /*
             * The request was made and the server responded with a
             * status code that falls out of the range of 2xx
             */
            console.log(error.response.data);
            console.log(error.response.status);
            console.log(error.response.headers);
          } else if (error.request) {
            /*
             * The request was made but no response was received, `error.request`
             * is an instance of XMLHttpRequest in the browser and an instance
             * of http.ClientRequest in Node.js
             */
            console.log(error.request);
          } else {
            // Something happened in setting up the request and triggered an Error
            console.log("Error", error.message);
          }
          console.log(error.config);
        }
      );
  }
}
