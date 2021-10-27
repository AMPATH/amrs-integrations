import { ResponseToolkit, ServerRoute } from "@hapi/hapi";
import { HTTPResponse } from "../interfaces/response";
import ConnectionManager from "../loaders/mysql";
import { savePrescription } from "../models/prescription";
import PatientService from "../services/patient";
import PrescriptionService from "../services/prescription";
export const adtRoutes: ServerRoute[] = [
  {
    method: "POST",
    path: "/api/dispense",
    handler: async function (request, h: ResponseToolkit) {
      // Receive ADT request and Save in drug orders table
      const payload = request.payload as IADTDispense.ADTDispense;
      console.log(payload.drug_details);
      const CM = ConnectionManager.getInstance();
      const amrsCon = await CM.getConnectionAmrs();
      savePrescription(payload, amrsCon);
      let responseMessage: HTTPResponse = {
        code: 200,
        message: "Dispense information received successfully.",
      };
      let response = h.response(responseMessage);
      response.header("Content-Type", "application/json");
      return response;
    },
  },
  {
    method: "POST",
    path: "/api/prescription",
    handler: async function (request, h: ResponseToolkit) {
      // Receive ADT request and Save in drug orders table
      const adt = new PatientService();
      // Test person id and test location mfl code.
      const a = await adt.searchADT(request.payload);
      let response = h.response(a);
      response.header("Content-Type", "application/json");
      return response;
    },
  },
  {
    method: "POST",
    path: "/adt/poc-prescription",
    handler: async function (req, res: ResponseToolkit) {
      const service = new PrescriptionService();
      const result = await service.createPocPrescriptionPayload(req.payload);
      let responseMessage: HTTPResponse = {
        code: 200,
        message: "Details to show on the  prescription form.",
        body: result,
      };
      let response = res.response(responseMessage);
      response.header("Content-Type", "application/json");
      return response;
    },
  },
];
