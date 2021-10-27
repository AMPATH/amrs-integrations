import { EventSubscriber, On } from "event-dispatch";
import { HTTPResponse } from "../interfaces/response";
import ADTRESTClient from "../loaders/ADT-rest-client";
import RegimenLoader from "../loaders/regimen-mapper";
import { loadProviderData, loadEncounterData } from "../models/patient";
import PrescriptionService from "../services/prescription";
import * as _ from "lodash";
const PromiseB = require("bluebird");

@EventSubscriber()
export default class PrescriptionSubscriber {
  @On("createADTPrescription")
  public async onPrescriptionCreate({
    savedAmrsOrders,
    patient,
    amrsCon,
  }: any) {
    let p = patient[0];
    let provider: EPrescription.OrderingPhysician = await loadProviderData(
      savedAmrsOrders[0].orderer.uuid,
      amrsCon
    );
    let encounter = await loadEncounterData(savedAmrsOrders[0].encounter.uuid);
    const data = new ADTRESTClient("");
    const regimenLoader = new RegimenLoader();
    const regimen = regimenLoader.getRegimenCode("3TC + NVP + AZT")[0];
    let transTime = new Date();

    let drug_details: any[] = [];
    savedAmrsOrders.forEach((o: any) => {
      drug_details.push({
        prescription_number: o.orderNumber,
        drug_code: regimen.toString(),
        strength: o.dose,
        dosage: o.dose,
        units: o.doseUnits.display,
        frequency: "ONCE A DAY",
        duration: o.duration,
        quantity: o.quantity,
        prescription_notes: o.instructions,
      });
    });

    let payload: any = {
      mflcode: p.mfl_code,
      patient_number_ccc: p.patient_ccc_number.replace("-", ""),
      order_details: {
        transaction_datetime: transTime.toISOString(),
        order_number: encounter[0].encounter_id,
        ordering_physician: {
          first_name: provider.given_name,
          last_name: provider.family_name,
          other_name: provider.middle_name,
          prefix: provider.prefix,
        },
        notes: "",
      },
      drug_details: drug_details,
      patient_observation_details: {
        current_weight: p.weight,
        current_height: p.height,
        // Add the regimen mapping

        current_regimen: regimen.toString(),
      },
    };
    console.log(p.height, p.weight);
    if (p.weight === null || p.height === null) {
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
  public async onCreateAMRSOrder(orderPayload: any) {
    let savedOrders: any[] = [];
    let promiseArray: any[] = [];
    const prescriptionService = new PrescriptionService();
    if (orderPayload.drugOrders !== undefined) {
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
        promiseArray.push(this.createAmrsOrder(payload));
      });

      PromiseB.allSettled(promiseArray).then((r: any) => {
        r.forEach(async (e: any) => {
          savedOrders.push(e._settledValueField);
        });
        prescriptionService.createPatientPrescriptionOnADT(savedOrders);
        console.log("SAVED ITEMS ", savedOrders.length);
      });
    }
  }

  public createAmrsOrder(payload: any) {
    const data = new ADTRESTClient("amrs");
    return new PromiseB((resolve: any, reject: any) => {
      return data.axios
        .post("ws/rest/v1/order", payload)
        .then((resp: HTTPResponse) => {
          resolve(resp);
        })
        .catch(
          (error: {
            response: { data: any; status: any; headers: any };
            request: any;
            message: any;
            config: any;
          }) => {
            reject(error);
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
