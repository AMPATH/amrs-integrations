import ADTRESTClient from "../loaders/ADT-rest-client";
import PatientService from "../services/patient";
import { EventSubscriber, On } from "event-dispatch";
import { HTTPResponse } from "../interfaces/response";
import PrescriptionService from "../services/prescription";
import RegimenLoader from "../loaders/regimen-mapper";
@EventSubscriber()
export default class PatientSubscriber {
  @On("search")
  public onPatientSearch({ patient, MFLCode, order_payload }: any) {
    console.log(
      "Search event has reached here",
      MFLCode,
      patient[0].patient_ccc_number
    );
    const data = new ADTRESTClient("");
    const prescriptionService = new PrescriptionService();
    const patientService = new PatientService();
    data.axios
      .get("/patients/" + patient[0].patient_ccc_number?.replace("-", ""), {
        params: {
          mflcode: MFLCode,
          identifier: "ccc",
          ccc: patient[0],
        },
      })
      .then(async (resp: any) => {
        let result: Patient.Patient[] = resp;
        if (result[0]?.patient_number_ccc) {
          await prescriptionService.createAMRSOrder(order_payload);
        } else {
          await patientService.createPatientOnADT(
            patient[0],
            MFLCode,
            order_payload
          );
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
  public onPatientCreate({ patient, mflcode, order_payload }: any) {
    console.log("create patient event ", patient.patient_ccc_number);
    const regimenLoader = new RegimenLoader();
    const mapped = regimenLoader.getRegimenCode(patient.arv_first_regimen);
    let regimen: String = "";
    if (mapped.length > 0) {
      regimen = mapped[0];
    }
    console.log(
      "First arv regimen ",
      patient.arv_first_regimen,
      " is mapped to ",
      regimen
    );

    let payload = {
      source: patient.source ? patient.source : "OUTPATIENT",
      medical_record_no: patient.medical_record_no,
      patient_number_ccc: patient.patient_ccc_number.replace("-", ""),
      first_name: patient.first_name,
      last_name: patient.last_name,
      other_name: patient.other_name,
      date_of_birth: new Date(patient.date_of_birth).toISOString(),
      place_of_birth: patient.place_of_birth,
      gender: patient.gender,
      pregnant: patient.is_pregnant ? patient.is_pregnant : "",
      breastfeeding: patient.is_mother_breastfeeding
        ? patient.is_mother_breastfeeding
        : "",
      weight: patient.weight ? patient.weight.toString() : 0,
      height: patient.height ? patient.height.toString() : 0,
      start_regimen: regimen,
      start_regimen_date: new Date(
        patient.arv_first_regimen_start_date
      ).toLocaleDateString(),
      enrollment_date: new Date(patient.enrollment_date).toLocaleDateString(),
      phone: patient.phone,
      address: patient.address,
      partner_status: "Unknown",
      family_planning: patient.contraceptive_method
        ? patient.contraceptive_method
        : "",
      alcohol: patient.alcohol ? patient.alcohol : "",
      smoke: patient.smoke ? patient.smoke : "",
      current_status: 1,
      service: patient.service,
      mfl_code: mflcode,
      who_stage: patient.cur_who_stage,
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
          await prescriptionService.createAMRSOrder(order_payload);
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
