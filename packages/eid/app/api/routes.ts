import { ResponseToolkit, ServerRoute } from "@hapi/hapi";
import UploadSaveAndArchiveCSV from "../services/csv_upload";
import GetCsvFileMetadata from "../services/get_csv_uploads";
import VoidCsvData from "../services/void_csv_upload";
import ExtractCSVAndPostToETL from "../services/csv_extractor";
import UpdateStatus from "../services/update_status";

let payload1: any = {
  payload: {
    output: "stream",
    parse: true,
    multipart: true,
    allow: "multipart/form-data",
    maxBytes: 10 * 1024 * 1024, // 10MB
  },
};

export const apiRoutes: ServerRoute[] = [
  {
    method: "POST",
    path: "/api/csv/uploads",
    options: payload1,
    // upload CSV load
    handler: async (request: any, h) => {
      // const file = request.payload.file;
      const { username, file_type, file, total_records } = request.payload;

      // validate file
      if (!username || !file_type || !file || !total_records) {
        return {
          error: "Failed. Kindly re-upload. Required parameters are missing",
          status: "error",
        };
      }

      let uploadService = new UploadSaveAndArchiveCSV();
      const res = await uploadService.uploadFile(
        file,
        username,
        file_type,
        total_records
      );
      return res;
    },
  },

  {
    method: "GET",
    path: "/api/csv/uploads",
    handler: async (request: any, h) => {
      const { logged_user } = request.query;
      const pageNumber = request.query.pageNumber || 1;
      const pageSize = request.query.pageSize || 50;
      let result = new GetCsvFileMetadata();
      const res = await result.getCsvData(logged_user, pageNumber, pageSize);
      return res;
    },
  },
  {
    method: "PUT",
    path: "/api/csv/uploads",
    handler: async (request: any, h) => {
      // get id from payload
      const id = request.payload;
      let result = new VoidCsvData();
      const res = await result.voidCsvData(id);
      return res;
    },
  },
  {
    method: "POST",
    path: "/api/push/csvs",
    // extract viral load and send to POC
    handler: async function (request: any, h) {
      const fileName = request.payload;
      let csvExtractor = new ExtractCSVAndPostToETL();
      const result = await csvExtractor.readCSVAndPost(fileName);
      return result;
    },
  },
  // get logs
  {
    method: "GET",
    path: "/api/csv/logs",
    handler: async function (request: any, h: ResponseToolkit) {
      const fs = require("fs");
      const path = require("path");
      const logsPath = path.join(__dirname, "..", "..", "..", "logs.log");
      const logs = fs.readFileSync(logsPath, "utf-8").trim(); // trim() to remove any trailing whitespace

      if (logs === "") {
        return []; // return an empty array if logs is empty
      }
      const logsArray = logs.split("\n");
      if (logsArray[logsArray.length - 1] === "") {
        logsArray.pop(); // remove the last element if it's an empty string
      }
      // return logs based on the query params
      const { file_name } = request.query;
      if (file_name) {
        const filteredLogs = logsArray.filter((log: any) => {
          try {
            const parsedLog = JSON.parse(log);
            return parsedLog.filename === file_name;
          } catch (e) {
            console.error(`Error parsing log: error: ${e}`);
            return false;
          }
        });
        return filteredLogs;
      } else {
        return logsArray;
      }
    },
  },
];
