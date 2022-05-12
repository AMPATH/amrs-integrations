import { ResponseToolkit, ServerRoute } from "@hapi/hapi";
import PatientService from "../services/patient.service";

export const apiRoutes: ServerRoute[] = [
  {
    method: "GET",
    path: "/api/identifier",
    handler: async function (request, h: ResponseToolkit) {
      const service = new PatientService();
      const identifiers = await service.searchPatient(request.query);

      const response = h.response(identifiers);
      return response;
    },
  },
  {
    method: "GET",
    path: "/api/uno",
    handler: async function (request, h: ResponseToolkit) {
      const service = new PatientService();
      const identifiers = await service.searchPatientByID(request.query);

      const response = h.response(identifiers);
      return response;
    },
  }
];
