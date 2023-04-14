import { ResponseToolkit, ServerRoute } from "@hapi/hapi";
import ExtractVLAndPostToETL from "../services/vl_extractor";
import ExtractCD4AndPostToETL from "../services/cd4_extractor";
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
  },
};

export const apiRoutes: ServerRoute[] = [
  {
    method: "GET",
    path: "/api/push/viral_load",
    // extract viral load and send to POC
    handler: async function (request, h: ResponseToolkit) {
      let convertionService = new ExtractVLAndPostToETL();
      await convertionService.readCSVAndPost();
      return "success";
    },
  },

  {
    method: "GET",
    path: "/api/push/cd4_count",
    // extract CD4 count and send to POC
    handler: async function (request, h: ResponseToolkit) {
      let convertionService = new ExtractCD4AndPostToETL();
      await convertionService.readCSVAndPost();
      return "success";
    },
  },
  {
    method: "POST",
    path: "/api/csv/uploads",
    options: payload1,
    // upload CSV load
    handler: async (request: any, h) => {
      // const file = request.payload.file;
      const {username, file_type, file, total_records} = request.payload;

      // validate file
      if(!username || !file_type || !file || !total_records) {
        return {error: "Failed. Kindly re-upload. Required parameters are missing", status: 'error'};
      }

      let uploadService = new UploadSaveAndArchiveCSV();
      const res = await uploadService.uploadFile(file, username, file_type, total_records);
      return res;
    },
  },

  {
    method: "GET",
    path: "/api/csv/uploads",
    handler: async (request: any, h) => {
      // const {username} = request.query;
      const pageNumber = request.query.pageNumber || 1;
      const pageSize = request.query.pageSize || 5;
    let result =  new GetCsvFileMetadata()
    const res = await result.getCsvData(pageNumber, pageSize)
    return res
    },
  },
  {
    method: "PUT",
    path: "/api/csv/uploads",
    handler: async (request: any, h) => {
      // get id from payload
      const id = request.payload;
      let result =  new VoidCsvData()
      const res = await result.voidCsvData(id)
      return res
    }
  },
  {
    method: "POST",
    path: "/api/push/csvs",
    // extract viral load and send to POC
    handler: async function (request: any, h ) {
      const fileName = request.payload;
     let csvExtractor = new ExtractCSVAndPostToETL();
     const result = await csvExtractor.readCSVAndPost(fileName);
      return result;
    },
  },
  //update status of csv file
  {
    method: "PUT",
    path: "/api/csv/update_status",
    handler: async (request: any, h) => {
      let result =  new UpdateStatus()
      const res = await result.updateStatus(request.payload)
      return res
    }
  },
];
