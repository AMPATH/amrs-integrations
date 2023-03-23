import { ServerRoute } from "@hapi/hapi";
import PatientService, { RequestParams } from "../services/patient.service";
import MonthlyReportService from "../services/monthly-report.service";

const Joi = require("joi");

export const apiRoutes: ServerRoute[] = [
  {
    method: "POST",
    path: "/api/rde-sync/queue",
    handler: async function (request, h) {
      const patientService = new PatientService();

      await patientService.queueRDEPatients(
        request.payload as RequestParams,
        h
      );
      return "success";
    },
  },
  {
    method: "DELETE",
    path: "/api/rde-sync/patient/{id}&purge=true",
    handler: async function (request, h) {
      const id = request.params.id;

      const patientService = new PatientService();
      await patientService.deletePatientRecord(id, h);

      return "deleted";
    },
  },
  {
    method: "GET",
    path: "/api/rde-sync/queue",
    handler: async function (request, h) {
      const params = request.params || {};

      const reportParams = {
        user_id: request.query?.user_id,
        reporting_month: request.query?.reporting_month,
        h: h,
      };

      const monthlyService = new MonthlyReportService();
      return monthlyService.getHivMonthlyReportFrozen(reportParams);
    },
    options: {
      validate: {
        query: Joi.object({
          user_id: Joi.number().integer().required(),
          reporting_month: Joi.string().required(),
        }),
      },
    },
  },
];
