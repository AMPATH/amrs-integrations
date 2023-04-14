import * as Papa from "papaparse";
import * as Fs from "fs";
import GetPatient from "../helpers/dbConnect";
import config from "@amrs-integrations/core";
import Validators from "../helpers/validators";
import Helpers from "../helpers/helperFunctions";
import moment from "moment";
import path from "path";
export default class ExtractVLAndPostToETL {
  public async readCSVAndPost() {
    try {
      let logMessage: String;
      const helper = new Helpers();

      // this file path needs to be passed from the client
      const file = Fs.readFileSync(
        path.join(path.dirname(__dirname), "../app/uploads/test_data.csv"),
        "utf-8"
      );
      // Replace spaces in headers with underscores

      const options = {
        header: true,
        transformHeader: (header: string) =>
          header.replace(/\s+/g, "_").toLowerCase(),
      };
      const rows = Papa.parse(file, options).data;
      let ResultData: any = [];
      // Iterate through rows and make POST request
      for (let row of rows) {
        // Get patient UUID using identifier
        let data: any = row;
        let getPatient = new GetPatient();
        let validator = new Validators();
        let patientUUID: any = "";
        let order_number: any;
        let obs_count: any;

        //check type of identifier
        let isCCC: boolean = validator.checkIdentifierIsCCC(
          data.patient_ccc_no
        );
        patientUUID = await getPatient.getPatientUUIDUsingIdentifier(
          data.patient_ccc_no,
          isCCC
        );

        //check if data is already synced
        obs_count = await getPatient.checkPatientVLSync(data, patientUUID);
        if (obs_count[0].count > 0) {
          logMessage = "Patient Results Already Synced" + data.patient_ccc_no;
          //data already synced for this patient
          helper.logError(logMessage, "syncedLog.log");
          continue;
        }
        // getpatient order number
        order_number = await getPatient.getPatientOrderNumber(
          data.order_number
        );

        if (patientUUID.length > 0) {
          // validate viral load input
          let valid: any = validator.checkStatusOfViralLoad(
            data.lab_viral_load
          );

          if (valid === 0 || valid === 1) {
            //post to POC
            data.viral_load = 0;
            let collection_date = moment
              .utc(data.collection_date, "DD/MM/YYYY")
              .add(3, "hours")
              .format();
            let obs: EIDPayloads.Observation = {
              person: patientUUID[0].uuid,
              concept: "a8982474-1350-11df-a1f1-0026b9348838",
              obsDatetime: collection_date,
              value: valid == 1 ? data.lab_viral_load : 0,
              order: order_number.length > 0 ? data.order_number : null,
            };

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
                console.log("VL saved successfully", openHIMResp);
              })
              .catch((err: any) => {
                console.log("Error", err);
              });

            return ResultData;
          } else {
            logMessage =
              "Viral Load not valid. Input value: " + data.lab_viral_load;
            helper.logError(logMessage, "viralloadErrorLog.log");
          }
        } else {
          //log erroneaous identifier
          logMessage =
            "UUID doesn't exist for identifier: " + data.patient_ccc_no;
          helper.logError(logMessage, "syncErroLog.log");
          continue;
        }
      }
    } catch (err) {
      console.log(err);
    }
  }
}
