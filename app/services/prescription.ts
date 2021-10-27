import { EventDispatcher } from "event-dispatch";
import ConnectionManager from "../loaders/mysql";
import ADTRESTClient from "../loaders/ADT-rest-client";
import * as _ from "lodash";
import PatientService from "../services/patient";
import DrugConcepts from "../loaders/drug-concepts";
const CM = ConnectionManager.getInstance();
const PromiseB = require("bluebird");

export default class PrescriptionService {
  eventDispatcher: EventDispatcher;
  constructor() {
    this.eventDispatcher = new EventDispatcher();
  }
  public async createAMRSOrder(order_payload: any) {
    console.log("Initiate createAMRSOrder event", order_payload);
    this.eventDispatcher.dispatch("createAMRSOrder", order_payload);
  }

  public async createPatientPrescriptionOnADT(savedAmrsOrders: any[]) {
    const patientService = new PatientService();
    const patient = await patientService.loadPatientData(
      savedAmrsOrders[0].patient.uuid
    );
    const CM = ConnectionManager.getInstance();
    const amrsCon = await CM.getConnectionAmrs();
    this.eventDispatcher.dispatch("createADTPrescription", {
      savedAmrsOrders,
      patient,
      amrsCon,
    });
  }

  public async createPocPrescriptionPayload(data: any) {
    let arvObs: any = [];
    let arvRegimenPlan = "";
    /** Extract regimen plan */
    _.each(data.obs, (curObs: any) => {
      if (curObs.concept.uuid === "a89b75d4-1350-11df-a1f1-0026b9348838") {
        arvRegimenPlan = curObs.value.uuid;
      }
    });

    /** Extract arv obs depending on the regimen plan*/
    switch (arvRegimenPlan) {
      case "a89b7908-1350-11df-a1f1-0026b9348838": // CONTINUE REGIMEN
        arvObs = data.obs.filter(
          (ob: any) =>
            ob.concept.uuid === "a899cf5e-1350-11df-a1f1-0026b9348838"
        );
        break;
      /** CHANGE REGIMEN, CHANGE DOSE, CHANGE FORMULATION, DRUG SUBSTITUTION, START ARVS, RESTART*/
      case "a89b7c50-1350-11df-a1f1-0026b9348838":
      case "a898c938-1350-11df-a1f1-0026b9348838":
      case "a89b7ae8-1350-11df-a1f1-0026b9348838":
      case "a8a00158-1350-11df-a1f1-0026b9348838":
      case "a89b77aa-1350-11df-a1f1-0026b9348838":
      case "a8a00220-1350-11df-a1f1-0026b9348838":
        arvObs = data.obs.filter(
          (obs: any) =>
            obs.concept.uuid === "a89b6a62-1350-11df-a1f1-0026b9348838"
        );
        break;
    }

    let drugConcepts = await this.getFormattedConcept(arvObs);

    const pocPrescriptionPayload = {
      encounter: data.uuid,
      patient: data.patient.uuid,
      orderer: data.encounterProviders,
      drugConcepts: drugConcepts,
    };
    return pocPrescriptionPayload;
  }

  public async getFormattedConcept(arvObs: any[]) {
    let drugOrders: any = [];
    let promiseArray: any[] = [];
    _.forEach(arvObs, (ob) => {
      promiseArray.push(this.getArvConcept(ob));
    });
    return PromiseB.allSettled(promiseArray).then((r: any) => {
      r.forEach(async (e: any) => {
        drugOrders.push(e._settledValueField);
      });
      return drugOrders;
    });
  }

  public async getArvConcept(ob: any) {
    const client = new ADTRESTClient("amrs");
    return new Promise((resolve: any, reject: any) => {
      if (ob.value.links[0].resourceAlias == "concept") {
        this.getDrugConcept(client, ob.value.uuid)
          .then((res) => {
            resolve(res);
          })
          .catch((e) => reject(e));
      } else if (ob.value.links[0].resourceAlias == "drug") {
        this.getDrug(client, ob.value.uuid)
          .then((res) => {
            resolve(res);
          })
          .catch((e) => reject(e));
      }
    });
  }

  public async getDrug(client: ADTRESTClient, uuid: String) {
    return client.axios
      .get("ws/rest/v1/drug/" + uuid)
      .then(async (res: any) => {
        const drugConcept = {
          name: this.getConceptName(DrugConcepts, uuid)
            ? this.getConceptName(DrugConcepts, uuid)
            : res.name,
          uuid: res.concept.uuid,
          display: res.concept.display,
          type: "drug",
        };
        return drugConcept;
      })
      .catch(
        (error: {
          response: { data: any; status: any; headers: any };
          request: any;
          message: any;
          config: any;
        }) => {
          console.log(error.response.data);
        }
      );
  }

  public async getDrugConcept(client: ADTRESTClient, uuid: String) {
    return client.axios
      .get("ws/rest/v1/concept/" + uuid)
      .then(async (res: any) => {
        const drugConcept = {
          name: this.getConceptName(DrugConcepts, uuid)
            ? this.getConceptName(DrugConcepts, uuid)
            : res.names[2].display,
          uuid: res.uuid,
          display: res.display,
          type: "concept",
        };
        return drugConcept;
      })
      .catch(
        (error: {
          response: { data: any; status: any; headers: any };
          request: any;
          message: any;
          config: any;
        }) => {
          console.log(error.message);
        }
      );
  }

  private getConceptName(concepts: any[], uuid: String) {
    const curConcept = concepts.filter((c: any) => c.concept === uuid);
    if (!_.isEmpty(curConcept)) {
      return curConcept[0].label;
    }
  }
}
