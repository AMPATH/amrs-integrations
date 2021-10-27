import { EventDispatcher } from "event-dispatch/EventDispatcher";
import ConnectionManager from "../loaders/mysql";
import { loadPatient } from "../models/patient";
const CM = ConnectionManager.getInstance();

export default class PatientService {
  eventDispatcher: EventDispatcher;
  constructor() {
    this.eventDispatcher = new EventDispatcher();
  }
  public async searchADT(order_payload: any) {
    const patient = await this.loadPatientData(order_payload.patient);
    const MFLCode = patient[0].mfl_code;
    /** dispatch search event */
    this.eventDispatcher.dispatch("search", {
      patient,
      MFLCode,
      order_payload,
    });
    return patient[0];
  }
  public async createPatientOnADT(
    patient: any,
    MFLCode: string,
    order_payload: any
  ) {
    const mflcode = MFLCode;
    /** Dispatch create patient event */
    this.eventDispatcher.dispatch("createPatient", {
      patient,
      mflcode,
      order_payload,
    });
  }
  public async loadPatientData(uuid: string) {
    const amrsCon = await CM.getConnectionAmrs();
    let amrsPatient = await loadPatient(uuid, amrsCon);
    amrsCon.destroy();
    return amrsPatient;
  }
}
