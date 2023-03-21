import path from "path";
import fs from "fs";
import csv from "csv-parser";
import Validators from "../helpers/validators";
import GetPatient from "../helpers/dbConnect";
import Helpers from "../helpers/helperFunctions";
import moment from "moment";
import config from "@amrs-integrations/core";
import { logToFile } from "../helpers/logger";

export default class ExtractCSVAndPostToETL {
  public async readCSVAndPost(fileName: string) {
    try {
      const filePath = path.join(__dirname, `../uploads${fileName}`);
      const fileContents = fs.readFileSync(filePath, "utf-8");

      // Determine if the file is a CD4 or viral load file
      const isViralLoadFile = fileContents.includes("Lab Viral Load");
      const isCD4File = fileContents.includes("CD4 abs");
      const getPatient = new GetPatient();
      const filename: any = fileName.split("/").pop();
      const validator = new Validators();
      let alreadySynced = 0;
      let successfulSync = 0;
      let failed = 0;

      const rows: any = await new Promise(async (resolve, reject) => {
        if (isViralLoadFile) {
          // File is a viral load file, extract columns accordingly
          const results: any = [];
          fs.createReadStream(filePath)
            .pipe(csv())
            .on("data", async (row: any) => {
              let {
                "Lab Viral Load": value,
                "Collection Date": collectionDate,
                "Patient CCC No": patientCCCNo,
                "Order No": order,
              } = row;
              // Check if any of the extracted columns are empty
              if (!value || !collectionDate || !patientCCCNo) {
                logToFile(
                  filename,
                  "error",
                  `${patientCCCNo}': One or more extracted columns are empty' `
                );
                return;
              }
              // Check if the patient CCC number is valid

              const isValidCCC = validator.checkIdentifierIsCCC(patientCCCNo);
              let patientUUID: any = "";

              // // get the patient uuid from db
              const patientID = await getPatient.getPatientUUIDUsingIdentifier(
                patientCCCNo,
                isValidCCC
              );

              if ((patientID.length = 0)) {
                failed++;

                logToFile(
                  filename,
                  "error",
                  `${patientCCCNo}': No record for this patient'`
                );
                return;
              }

              let valid: any = validator.checkStatusOfViralLoad(value);
              if (valid === 2) {
                failed++;
                logToFile(
                  filename,
                  "error",
                  `${patientCCCNo}': Record has erroneous viral load value: ' ${value}`
                );
                return;
              }
              let viralValue = valid == 1 ? value : 0;
              let collection_date = moment
                .utc(collectionDate, "YYYY-MM-DD HH:mm:ss")
                .add(3, "hours")
                .format();

              // check if data is already synced
              const isDataSynced = await getPatient.checkPatientVLSync(
                collection_date,
                viralValue,
                patientID[0].uuid
              );

              if (isDataSynced[0].count > 0) {
                alreadySynced++;
                logToFile(
                  filename,
                  "error",
                  `${patientCCCNo}': Record already exists'`
                );

                return;
              }

              let obs: EIDPayloads.Observation = {
                person: patientID[0].uuid,
                concept: "a8982474-1350-11df-a1f1-0026b9348838",
                obsDatetime: collection_date,
                value: valid == 1 ? value : 0,
                order: "",
              };

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
            })
            .on("end", () => {
              resolve(results);
            });
        } else if (isCD4File) {
          // File is a CD4 file, extract columns accordingly
          const results: any = [];
          fs.createReadStream(filePath)
            .pipe(csv())
            .on("data", async (row: any) => {
              let {
                "CD4 abs": value,
                "Date Collected/Drawn": collectionDate,
                "Ampath #": patientCCCNo,
                "Provider ID": order,
              } = row;
              // Check if any of the extracted columns are empty
              if (!value || !collectionDate || !patientCCCNo) {
                logToFile(
                  filename,
                  "error",
                  `${patientCCCNo}': One or more extracted columns are empty.'`
                );
                return;
              }
              // Check if the patient CCC number is valid

              const isValidCCC = validator.checkIdentifierIsCCC(patientCCCNo);
              let patientUUID: any = "";
              // get the patient uuid from db
              const patientID = await getPatient.getPatientUUIDUsingIdentifier(
                patientCCCNo,
                isValidCCC
              );

              if ((patientID.length = 0)) {
                failed++;
                logToFile(
                  filename,
                  "error",
                  `${patientCCCNo}: No record for this patient'`
                );
                return;
              }
              let collection_date = moment
                .utc(collectionDate, "YYYY-MM-DD HH:mm:ss")
                .add(3, "hours")
                .format();
              const isCD4Synced = await getPatient.checkPatientCD4Sync(
                row,
                patientID,
                collection_date
              );
              if (isCD4Synced[0].count > 0) {
                alreadySynced++;
                logToFile(
                  filename,
                  "error",
                  `${patientCCCNo}': Record already exist' `
                );
                return;
              }

              let obs: EIDPayloads.Observation = {
                person: patientUUID,
                concept: "457c741d-8f71-4829-b59d-594e0a618892",
                obsDatetime: collectionDate,
                value: value,
                order: order || "",
              };

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
                  alreadySynced++;
                  console.log("cd4 saved successfully", openHIMResp.identifier);
                })
                .catch((err: any) => {
                  failed++;
                  logToFile(
                    filename,
                    "error",
                    `${patientCCCNo} ' Error:  ${err} '`
                  );
                });
            })
            .on("end", () => {
              resolve(results);
            });
        } else {
          // File is neither a CD4 nor a viral load file
          logToFile(
            filename,
            "error",
            `'File is neither a CD4 nor a viral load file'`
          );
          return reject("File is neither a CD4 nor a viral load file");
        }
      });
      // update metadata
      let filestatus = "Success";
      if (alreadySynced > 0 || successfulSync > 0 || failed > 0) {
        filestatus = "Error";
      }

      const params = {
        file_name: filename,
        existing_records: alreadySynced,
        successful: successfulSync,
        failed_records: failed,
        status: filestatus,
      };
      const updateSyncStatus = await getPatient.updateExistingData(params);
      if (updateSyncStatus.affectedRows > 0) {
        console.log("sync status updated");
      }

      return {
        message: "CSV file is being processed",
        syncedRows: rows,
      };
    } catch (error) {
      console.log("Error:", error);
      // throw new Error("Failed to process CSV file");
      return {
        message: "Failed to process CSV file",
      };
    }
  }
}
