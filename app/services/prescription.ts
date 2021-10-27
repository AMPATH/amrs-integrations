import { EventDispatcher } from "event-dispatch";
import ConnectionManager from "../loaders/mysql";
import ADTRESTClient from "../loaders/ADT-rest-client";
import * as _ from "lodash";
import PatientService from "../services/patient";
const CM = ConnectionManager.getInstance();

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
    }

    let drugConcepts = await this.getFormattedConcept(data, arvObs);

    const pocPrescriptionPayload = {
      encounter: data.uuid,
      patient: data.patient.uuid,
      orderer: data.encounterProviders,
      drugConcepts: drugConcepts,
    };
    return pocPrescriptionPayload;
  }

  public async getFormattedConcept(data: any, arvObs: any[]) {
    const client = new ADTRESTClient("amrs");
    let drugOrders: any = [];
    const lastItem = arvObs.slice(-1)[0];
    return new Promise((resolve: any, reject: any) => {
      _.forEach(arvObs, (ob) => {
        if (ob.value.links[0].resourceAlias == "concept") {
          this.getDrugConcept(client, ob.value.uuid).then((r) => {
            drugOrders.push(r);
            arvObs.length = 0;
            if (lastItem.uuid === ob.uuid) {
              resolve(drugOrders);
            }
          });
        } else if (ob.value.links[0].resourceAlias == "drug") {
          this.getDrug(client, ob.value.uuid).then((r) => {
            drugOrders.push(r);
            if (lastItem.uuid === ob.uuid) {
              resolve(drugOrders);
            }
          });
        }
      });
    });
  }

  public async getDrug(client: ADTRESTClient, uuid: String) {
    return client.axios
      .get("ws/rest/v1/drug/" + uuid)
      .then(async (res: any) => {
        const drugConcept = {
          name: res.name,
          uuid: res.concept.uuid,
          display: res.concept.display,
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
          name: res.names[2].display,
          uuid: res.uuid,
          display: res.display,
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
}
