import * as Papa from "papaparse";
import * as Fs from "fs";
import GetPatient from "../helpers/dbConnect";
import config from "@amrs-integrations/core";
import Validators from "../helpers/validators";
import moment from "moment";
import path from "path";
export default class ExtractCD4AndPostToETL {
  public async readCSVAndPost() {
    try {
      const file = Fs.readFileSync(
        path.join(path.dirname(__dirname), "../app/uploads/cd4_file.csv"),
        "utf-8"
      );
      // format header
      const options = {
        header: true,
        transformHeader: (header: string) => {
          // Replace spaces in headers with underscores
          header = header.replace(/\s+/g, "_").toLowerCase();
          // Replace # with 'no' in headers
          header = header.replace("#", "no");
          //replace /(all special characters) with _
          header = header.replace(/[^a-zA-Z0-9]/g, "_");
          return header;
        },
      };

      const rows = Papa.parse(file, options).data;

      let ResultData: any = [];
      // Iterate through rows and make POST requests
      for (let row of rows) {
        // Get patient UUID using identifier
        let data: any = row;
        let getPatient = new GetPatient();
        let validator = new Validators();
        let isCCC: boolean = validator.checkIdentifierIsCCC(
          data.patient_ccc_no
        );
        let patientUUID: any = await getPatient.getPatientUUIDUsingIdentifier(
          data.ampath_no,
          isCCC
        );

        if (patientUUID.length > 0) {
          //initialize variables

          const cd4_abs: number = data.ampath_no;

          let collection_date = moment
            .utc(data.date_collected_drawn, "YYYY-MM-DD")
            .add(3, "hours")
            .format("DD/MM/YYYY");

          let obs: EIDPayloads.Observation = {
            person: patientUUID[0].uuid,
            concept: "457c741d-8f71-4829-b59d-594e0a618892",
            obsDatetime: collection_date,
            value: cd4_abs,
            order: "",
          }; //correct concept for cd4

          ResultData.push(obs);

          let httpClient = new config.HTTPInterceptor(
            config.dhp.url || "",
            "",
            "",
            "dhp",
            ""
          );
          httpClient.axios
            .post("", obs)
            .then(async (openHIMResp: any) => {
              console.log("CD4 saved successfully", openHIMResp.identifier);
            })
            .catch((err: any) => {
              console.log("Error", err);
            });
        }
      }
      return ResultData;
    } catch (err) {
      console.log(err);
    }
  }
}
