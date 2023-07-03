import path from "path";
import * as Fs from "fs";
import * as Papa from "papaparse";
import csv from "csv-parser";
import Validators from "../helpers/validators";
import GetPatient from "../helpers/dbConnect";
import Helpers from "../helpers/helperFunctions";
import moment from "moment";
import config from "@amrs-integrations/core";
import { logToFile } from "../helpers/logger";
import csvParser from "csv-parser";
import { Console } from "winston/lib/winston/transports";

export default class ExtractCSVAndPostToETL {
  public async readCSVAndPost(fileName: string) {
    try {
      let ResultData: any = [];
      const getPatient = new GetPatient();
      const helper = new Helpers();
      const filename: any = fileName.split("/").pop();
      const validator = new Validators();
      let alreadySynced: number = 0;
      let successfulSync: number = 0;
      let failed: number = 0;
      let total: number = 0;
      let uuid: any = "";
      const filePath = path.join(__dirname, `../uploads${fileName}`);
      const fileContents = Fs.readFileSync(filePath, "utf-8");
      // Determine if the file is a CD4 or viral load file
      const isViralLoadFile = fileContents.includes("Lab Viral Load");
      const isCD4File = fileContents.includes("CD4 abs");

      if (isViralLoadFile) {
        try {
          // Replace spaces in headers with underscores
          const options = {
            header: true,
            transformHeader: (header: string) =>
              header.replace(/\s+/g, "_").toLowerCase(),
          };

          const rows = Papa.parse(fileContents, options).data;

          total = rows.length;
          // Iterate through rows and make POST request
          for (let row of rows) {
            console.log(row);
            // Get patient UUID using identifier
            let data: any = row;
            //check if all required columns are available
            if (
              !data.lab_viral_load ||
              !data.collection_date ||
              !data.patient_ccc_no 
            ) {
              failed++;
              logToFile(
                filename,
                "error",
                `${data.patient_ccc_no}': One or more extracted columns are empty' `
              );
              continue;
            }

            let patientCCCNo = data.patient_ccc_no;
            let value = data.lab_viral_load;
            let collectionDate = data.collection_date;
            let order = data.order_number ? data.order_number : '';;
            // Check if the patient CCC number is valid

            const isValidCCC = validator.checkIdentifierIsCCC(patientCCCNo);

            // get the patient uuid from db
            const patientID = await getPatient.getPatientUUIDUsingIdentifier(
              patientCCCNo,
              isValidCCC
            );
            if (patientID.length == 0) {
              failed++;
              logToFile(
                filename,
                "error",
                `${patientCCCNo}': No record for this patient'`
              );
              continue;
            }
            uuid = patientID[0].uuid;
            // check if viral load value is valid
            let valid: any = validator.checkStatusOfViralLoad(value);
            if (valid === 2) {
              failed++;
              logToFile(
                filename,
                "error",
                `${patientCCCNo}': Record has erroneous viral load value: ' ${value}`
              );
              continue;
            }
            let viralValue = valid == 1 ? value : 0;
            let collection_date = moment
              .utc(collectionDate, "DD/MM/YYYY")
              .add(3, "hours")
              .format("YYYY-MM-DD 00:00:00");

            // check if data is already synced
            const isDataSynced = await getPatient.checkPatientVLSync(
              collection_date,
              viralValue,
              uuid
            );

            if (isDataSynced[0].count > 0) {
              alreadySynced++;
              logToFile(
                filename,
                "info",
                `${patientCCCNo}': Record already exists'`
              );

              continue;
            }
            let obs: EIDPayloads.Observation = {
              person: uuid,
              concept: "a8982474-1350-11df-a1f1-0026b9348838",
              obsDatetime: collection_date,
              value: valid == 1 ? value : 0,
              order: order,
            };

            ResultData.push(obs);
            let httpClient = new config.HTTPInterceptor(
                    config.dhp.url || "http://10.50.80.56:5001/eid/csv",
              // "http://10.50.80.56:5001/staging/eid/csv",
              "",
              "",
              "dhp",
              ""
            );

            httpClient.axios
              .post("", obs)
              .then(async (openHIMResp: any) => {
                successfulSync++;
                console.log("VL saved successfully", openHIMResp.identifier);
              })
              .catch(async (err: any) => {
                console.log("Error syncing:", err);
                failed++;
                logToFile(
                  filename,
                  "error",
                  `${patientCCCNo}': Error syncing VL '`
                );
              });
          }
        } catch (err) {
          console.log(err);
        }
      } else if (isCD4File) {
        // try {
        //   // Replace spaces in headers with underscores
        //   const options = {
        //     header: true,
        //     transformHeader: (header: string) =>
        //       header.replace(/\s+/g, "_").toLowerCase(),
        //   };

        //   const rows = Papa.parse(fileContents, options).data;

        //   total = rows.length;
        //   // Iterate through rows and make POST request
        //   for (let row of rows) {
        //     console.log(row);
        //     // Get patient UUID using identifier
        //     let data: any = row;
        //     //check if all required columns are available
        //     if (
        //       !data.cd4_abs ||
        //       !data.date_collected_drawn ||
        //       !data.ampath_no ||
        //       !data.order_number
        //     ) {
        //       failed++;
        //       logToFile(
        //         filename,
        //         "error",
        //         `${data.patient_ccc_no}': One or more extracted columns are empty' `
        //       );
        //       continue;
        //     }

        //     let patientCCCNo = data.ampath_no;
        //     let value = data.cd4_abs;
        //     let collectionDate = data.date_collected_drawn;
        //     let order = data.order_number;
        //     // Check if the patient CCC number is valid

        //     const isValidCCC = validator.checkIdentifierIsCCC(patientCCCNo);

        //     // get the patient uuid from db
        //     const patientID = await getPatient.getPatientUUIDUsingIdentifier(
        //       patientCCCNo,
        //       isValidCCC
        //     );
        //     if (patientID.length == 0) {
        //       failed++;
        //       logToFile(
        //         filename,
        //         "error",
        //         `${patientCCCNo}': No record for this patient'`
        //       );
        //       continue;
        //     }
        //     uuid = patientID[0].uuid;

        //     let collection_date = moment
        //       .utc(collectionDate, "DD/MM/YYYY")
        //       .add(3, "hours")
        //       .format("YYYY-MM-DD 00:00:00");

        //     // check if data is already synced
        //     const isDataSynced = await getPatient.checkPatientCD4Sync(
        //       row,
        //       patientID,
        //       collection_date
        //     );

        //     if (isDataSynced[0].count > 0) {
        //       alreadySynced++;
        //       logToFile(
        //         filename,
        //         "info",
        //         `${patientCCCNo}': Record already exists'`
        //       );

        //       continue;
        //     }
        //     let obs: EIDPayloads.Observation = {
        //       person: uuid,
        //       concept: "457c741d-8f71-4829-b59d-594e0a618892",
        //       obsDatetime: collection_date,
        //       value: value,
        //       order: order,
        //     };

        //     ResultData.push(obs);
        //     let httpClient = new config.HTTPInterceptor(
        //       config.dhp.url || "http://10.50.80.56:5001/eid/csv",
        //       // "http://10.50.80.56:5001/staging/eid/csv",
        //       "",
        //       "",
        //       "dhp",
        //       ""
        //     );

        //     httpClient.axios
        //       .post("", obs)
        //       .then(async (openHIMResp: any) => {
        //         successfulSync++;
        //         console.log("CD4 saved successfully", openHIMResp.identifier);
        //       })
        //       .catch(async (err: any) => {
        //         console.log("Error syncing:", err);
        //         failed++;
        //         logToFile(
        //           filename,
        //           "error",
        //           `${patientCCCNo}': Error syncing CD4 '`
        //         );
        //       });
        //   }
        // } catch (err) {
        //   console.log(err);
        // }
      } else {
        // File is neither a CD4 nor a viral load file
        logToFile(
          filename,
          "error",
          `'File is neither a CD4 nor a viral load file'`
        );
        // return reject("File is neither a CD4 nor a viral load file");
      }
      await sleep(100);
      // update metadata
      let filestatus = "Success";
      if (successfulSync == 0 || failed > 0) {
        filestatus = "Error";
      }

      const params = {
        file_name: filename,
        existing_records: alreadySynced,
        successful: successfulSync,
        failed_records: failed,
        status: filestatus,
      };
      const updateSyncStatus = await getPatient.updateEidCsvMetaData(params);
      if (updateSyncStatus.affectedRows > 0) {
        console.log("sync status updated");
      }
      return ResultData;
    } catch (error) {
      console.log("Error:", error);
      // throw new Error("Failed to process CSV file");
      return {
        message: "Failed to process CSV file",
      };
    }
  }
  public async updateMetadata(params: any) {}
}
function sleep(ms: any) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
