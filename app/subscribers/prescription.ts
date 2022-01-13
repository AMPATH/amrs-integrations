import { EventSubscriber, On } from "event-dispatch";
import { HTTPResponse } from "../interfaces/response";
import ADTRESTClient from "../loaders/ADT-rest-client";
import { loadProviderData, loadEncounterData } from "../models/patient";
import PrescriptionService from "../services/prescription";
import RegimenLoader from "../loaders/regimen-mapper";
import * as _ from "lodash";
const PromiseB = require("bluebird");

@EventSubscriber()
export default class PrescriptionSubscriber {
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
          doseUnits: curOrder.doseUnits,
          route: curOrder.route,
          frequency: curOrder.frequency,
          quantity: curOrder.quantity,
          quantityUnits: curOrder.quantityUnits,
          duration: curOrder.duration,
          durationUnits: curOrder.durationUnits,
          numRefills: 1,
          instructions: curOrder.instructions,
          drug: curOrder.drug,
        };
        promiseArray.push(this.createAmrsOrder(payload));
      });

      PromiseB.allSettled(promiseArray).then((r: any) => {
        r.forEach(async (e: any) => {
          savedOrders.push(e._settledValueField);
        });
        prescriptionService.createPatientPrescriptionOnADT(
          savedOrders,
          orderPayload
        );
        console.log(
          "Created AMRS orders successfully, Number of saved items = ",
          savedOrders.length
        );
      });
    }
  }

  @On("createADTPrescription")
  public async onPrescriptionCreate({
    savedAmrsOrders,
    orderPayload,
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
    let transTime = new Date();

    const regimenLoader = new RegimenLoader();
    const mapped = regimenLoader.getRegimenCode(p.cur_arv_meds);
    let regimen: String = "";
    if (mapped.length > 0) {
      regimen = mapped[0];
    }
    console.log(
      "Current arv regimen ",
      p.cur_arv_meds,
      " is mapped to ",
      regimen
    );

    let drug_details: any[] = [];
    savedAmrsOrders.forEach((o: any) => {
      console.log(
        "DRUG CODE  ",
        this.resolveDrugCode(o.concept.uuid, orderPayload)
      );
      drug_details.push({
        prescription_number: o.orderNumber,
        drug_code: this.resolveDrugCode(
          o.concept.uuid,
          orderPayload
        ) /*this is the drug name to appear in adt*/,
        frequency: o.frequency.display,
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

        current_regimen: regimen,
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
            console.log(error.response.data);
            console.log(error.response.status);
            console.log(error.response.headers);
          } else if (error.request) {
            console.log(error.request);
          } else {
            console.log("Error", error.message);
          }
          console.log(error.config);
        }
      );
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
            if (error.response) {
              console.log(error.response.data);
              console.log(error.response.status);
              console.log(error.response.headers);
            } else if (error.request) {
              console.log(error.request);
            } else {
              console.log("Error", error.message);
            }
            console.log(error.config);
          }
        );
    });
  }

  public resolveDrugCode(uuid: string, orderPayload: any) {
    let c = orderPayload.drugOrders.filter((c: any) => c.uuid == uuid);
    return c[0].drug_name;
  }
}
