import { EventSubscriber, On } from "event-dispatch";
import { HTTPResponse } from "../interfaces/response";
import ADTRESTClient from "../loaders/ADT-rest-client";
import RegimenLoader from "../loaders/regimen-mapper";
import { loadProviderData } from "../models/patient";
import PrescriptionService from "../services/prescription";
import * as _ from "lodash";
import orderPayload from "../poc_sample_payload";

@EventSubscriber()
export default class PrescriptionSubscriber {
  @On("createADTPrescription")
  public async onPrescriptionCreate({
    patient,
    amrsCon,
    order,
    amrsCCC,
    orderUUID,
  }: any) {
    let patients: Patient.Patient = patient[0];
    let provider: EPrescription.OrderingPhysician = await loadProviderData(
      amrsCCC,
      amrsCon
    );
    const data = new ADTRESTClient("");
    const regimenLoader = new RegimenLoader();
    const regimen = regimenLoader.getRegimenCode(patients.start_regimen)[0];
    let transTime = new Date();
    let payload: EPrescription.DrugOrder = {
      mflcode: patient.mfl_code,
      patient_number_ccc: patients.patient_ccc_number.replace("-", ""),
      order_details: {
        transaction_datetime: transTime.toISOString(),
        order_number: order.split("-")[1],
        ordering_physician: {
          first_name: provider.given_name,
          last_name: provider.family_name,
          other_name: provider.middle_name,
          prefix: provider.prefix,
        },
        notes: "",
      },
      drug_details: [
        {
          prescription_number: orderUUID,
          drug_code: regimen.toString(),
          strength: "",
          dosage: "",
          units: "",
          frequency: "",
          duration: "",
          quantity: "10",
          prescription_notes: "",
        },
      ],
      patient_observation_details: {
        current_weight: patients.weight,
        current_height: patients.height,
        // Add the regimen mapping

        current_regimen: regimen.toString(),
      },
    };
    console.log(patients.height, patients.weight);
    if (patients.weight === null || patients.height === null) {
      return;
      //publish errors
    }
    data.axios
      .post("/prescription", payload)
      .then(async (resp: HTTPResponse) => {
        console.log(resp.message);
        if (resp.code !== 200) {
          //Publish event with payload and error that occurred
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
  @On("createAMRSOrder")
  public async onCreateAMRSOrder(x: any) {
    let savedOrders: any[] = [];
    if (orderPayload.drugOrders !== undefined) {
      const data = new ADTRESTClient("amrs");
      const lastItem = orderPayload.drugOrders.slice(-1)[0];
      orderPayload.drugOrders.forEach((curOrder: any) => {
        /** Construct AMRS order payload */
        let payload = {
          type: "drugorder",
          action: "new",
          urgency: "ROUTINE",
          dateActivated: new Date(),
          careSetting: "OUTPATIENT",
          encounter: orderPayload.encounter,
          patient: orderPayload.patient,
          concept: curOrder.uuid,
          orderer: orderPayload.orderer[0].provider.uuid,
          dose: 20,
          doseUnits: "a8a07f8e-1350-11df-a1f1-0026b9348838",
          route: "db0c5937-3874-4eae-9566-9a645ad7ac65",
          frequency: "bc1369f2-6795-11e7-843e-a0d3c1fcd41c",
          quantity: 10,
          numRefills: 1,
          quantityUnits: "a8a07f8e-1350-11df-a1f1-0026b9348838",
        };
        data.axios
          .post("ws/rest/v1/order", payload)
          .then(async (resp: HTTPResponse) => {
            savedOrders.push(resp);
            if (lastItem.uuid === curOrder.uuid) {
              /** TODO
               * Initiate events for creating and sending order prescription to ADT,
               * pass AMRS order details that will be use to construct ADT prescription payload.
               */
              console.log("SAVED ORDERS ** ", savedOrders);
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
      });
    }
  }
  public async fetchOrderNumber(
    body: any,
    data: ADTRESTClient,
    patient: Patient.Patient
  ) {
    let orderNumber = "";
    const prescriptionService = new PrescriptionService();
    data.axios
      .get("ws/rest/v1/order/" + body)
      .then(async (resp: HTTPResponse) => {
        if (resp.orderNumber) {
          //Publish event with payload and error that occurred
          orderNumber = resp.orderNumber;
          let orderUUID = resp.uuid;
          await prescriptionService.createPatientPrescriptionOnADT(
            patient,
            patient.mfl_code,
            orderNumber,
            patient.patient_ccc_number,
            orderUUID
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
}
