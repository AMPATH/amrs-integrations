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
      let value_ConceptID: any;
      let uuid: any = "";
      const filePath = path.join(__dirname, `../uploads${fileName}`);
      const fileContents = Fs.readFileSync(filePath, "utf-8");
      // Determine if the file is a CD4 or viral load file
      const isViralLoadFile = fileContents.includes("Lab Viral Load");
      const isCD4File = fileContents.includes("CD4 abs");
      const isHPVFile = fileContents.includes("Target 1");
      console.log("is HPV File", isHPVFile);

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
          console.log("Started Iteration: ", total);
          let number = 1;
          // Iterate through rows and make POST request
          for (let row of rows) {
            console.log(number);
            number++;
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
            let viralValue = null;
            let collectionDate = data.collection_date;
            let order = data.order_number ? data.order_number : "";
            let conceptId = "";
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
            } else if (valid === 3) {
              conceptId = "457c741d-8f71-4829-b59d-594e0a618892";
              viralValue = "a89c3f1e-1350-11df-a1f1-0026b9348838";
            } else {
              conceptId = "a8982474-1350-11df-a1f1-0026b9348838";
              viralValue = valid == 1 ? value : 0;
            }

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
              concept: conceptId,
              obsDatetime: collection_date,
              value: viralValue,
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
                logToFile(
                  "vl_success.log",
                  "info",
                  `${patientCCCNo}': Successful sync '`
                );
              })
              .catch(async (err: any) => {
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
        console.log("is cd4 File", isCD4File);
        try {
          value_ConceptID = "a89c3d8e-1350-11df-a1f1-0026b9348838";
          // Replace spaces in headers with underscores
          const options = {
            header: true,
            transformHeader: (header: string) =>
              header.replace(/\s+/g, "_").toLowerCase(),
          };
          const rows = Papa.parse(fileContents, options).data;
    
          total = rows.length;
          console.log("Started Iteration: ", total);
          // Iterate through rows and make POST request
          for (let row of rows) {
            // Get patient UUID using identifier
           
            let data: any = row;
           // console.log("DATA: ",data);
            //check if all required columns are available
            if (
              !data.cd4_abs ||
              !data.date_collected_drawn ||
              !data.ampath_no
            ) {
              failed++;
              logToFile(
                filename,
                "error",
                `${data.patient_ccc_no}': One or more extracted columns are empty' `
              );
              continue;
            }
            let patientCCCNo = data.ampath_no;
            let value = data.cd4_abs;
            let collectionDate = data.date_collected_drawn;
            let order = data.order_number ? data.order_number : "";
            let conceptID = "a8a8bb18-1350-11df-a1f1-0026b9348838";
            let validValue: any;
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
            let collection_date = moment
              .utc(collectionDate, "DD/MM/YYYY")
              .add(3, "hours")
              .format("YYYY-MM-DD 00:00:00");
            // check if data is already synced
            const isDataSynced = await getPatient.checkPatientCD4SyncCsv(
              value,
              uuid,
              collection_date
            );

            validValue = validator.checkCD4Status(value);
            if (validValue === 3) {
              conceptID = "457c741d-8f71-4829-b59d-594e0a618892";
              value = value_ConceptID;
            }

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
              concept: conceptID,
              obsDatetime: collection_date,
              value: value,
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
                logToFile(
                  filename,
                  "info",
                  `${patientCCCNo}': Successful CD4 '`
                );
              })
              .catch(async (err: any) => {
                failed++;
                logToFile(
                  filename,
                  "error",
                  `${patientCCCNo}': Error syncing CD4 ' ${err}`
                );
              });
          }
        } catch (err) {
          console.log(err);
        }
      } else if (isHPVFile) {
        try {
          // Replace spaces in headers with underscores
          const options = {
            header: true,
            transformHeader: (header: string) =>
              header.replace(/\s+/g, "_").toLowerCase(),
          };

          const rows = Papa.parse(fileContents, options).data;

          total = rows.length;
          console.log("Started Iteration: ", total);
          let number = 1;
          // Iterate through rows and make POST request
          for (let row of rows) {
            console.log(number);
            number++;
            // Get patient UUID using identifier
            let data: any = row;

            //check if all required columns are available
            if (
              !data.test_result ||
              !data.date_of_collection ||
              !data.sample_code
            ) {
              failed++;
              logToFile(
                filename,
                "error",
                `${data.patient_ccc_no}': One or more extracted columns are empty' `
              );
              continue;
            }

            let patientCCCNo = data.sample_code;
            let value = data.test_result;
            let hpvValue = null;
            let collectionDate = data.date_of_collection;
            let order = data.order_number ? data.order_number : "";
            let conceptId = "";
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
            let valid: any = validator.checkHPVStatus(value);
            console.log("Valid: ", valid);
            if (valid === 0) {
              failed++;
              logToFile(
                filename,
                "error",
                `${patientCCCNo}': Record has erroneous HPV value: ' ${value}`
              );
              continue;
            } else if (valid === 664) {
              conceptId = "a8a46fd6-1350-11df-a1f1-0026b9348838";
              hpvValue = "a896d2cc-1350-11df-a1f1-0026b9348838";
            } else if (valid === 703) {
              conceptId = "a8a46fd6-1350-11df-a1f1-0026b9348838";
              hpvValue = "a896f3a6-1350-11df-a1f1-0026b9348838";
            } else if (valid === 1138) {
              conceptId = "a8a46fd6-1350-11df-a1f1-0026b9348838";
              hpvValue = "a89a7ae4-1350-11df-a1f1-0026b9348838";
            } else {
              conceptId = "a8a46fd6-1350-11df-a1f1-0026b9348838";
              hpvValue = "a89a7ae4-1350-11df-a1f1-0026b9348838";
            }

            let collection_date = moment
              .utc(collectionDate, "DD/MM/YYYY")
              .add(3, "hours")
              .format("YYYY-MM-DD 00:00:00");

            // check if data is already synced
            const isDataSynced = await getPatient.checkPatientHPVSync(
              collection_date,
              valid,
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
              concept: conceptId,
              obsDatetime: collection_date,
              value: hpvValue,
              order: order,
            };

            console.log("Payload: ", obs);

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
                logToFile(
                  "hpv_success.log",
                  "info",
                  `${patientCCCNo}': Successful sync '`
                );
              })
              .catch(async (err: any) => {
                failed++;
                logToFile(
                  filename,
                  "error",
                  `${patientCCCNo}': Error syncing HPV'`
                );
              });
          }
        } catch (err) {
          console.log(err);
        }
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
      if (successfulSync == 0 && failed > 0) {
        filestatus = "Error";
      } else if (failed == 0 && successfulSync == 0 && alreadySynced > 0) {
        filestatus = "Synched";
      }
      console.log("File status", filestatus);
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
