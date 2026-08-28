import Validators from "../helpers/validators";
import GetPatient from "../helpers/dbConnect";
import Helpers from "../helpers/helperFunctions";
import moment, { now } from "moment";
import config from "@amrs-integrations/core";
import { logToFile } from "../helpers/logger";

export default class ExtractINSAndPostToETL {
  public async readINSAndPost(request: any) {
    let response: any = {};
    try {
      let ResultData: any = [];
      const getPatient = new GetPatient();
      const helper = new Helpers();
      const filename = "logs.log";
      const validator = new Validators();

      let alreadySynced: number = 0;
      let successfulSync: number = 0;
      let failed: number = 0;
      let total: number = 0;
      let uuid: any = "";
      let valid: any;
      let value_ConceptID: any;
      let validValue: any;
      let data: any = request; //JSON.parse(request);
      let eidobs: Array<any> = [];

      let patientCCCNo = helper.splitToCCC(data.patient);
      let external_id = data.id;
      let value = data.result;
      let collectionDate = data.date_collected;
      let testType = data.test_type;
      let order = data.order_number ? data.order_number : "";
      let resultingValue;
      let conceptID = "";
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
        response = JSON.stringify({
          id: external_id,
          timestamp: now(),
          status: "failed",
        });

        return response;
      }
      uuid = patientID[0].uuid;
      let collection_date = moment
        .utc(collectionDate, "YYYY-MM-DD")
        .add(3, "hours")
        .format("YYYY-MM-DD 00:00:00");
      /**
       * Test type definition
       * 1 PCR
       * 2 Viral Load
       * 3 CD4
       * 5 HPV
       *  */

      if (testType === 1) {
        // PCR
        conceptID = "a898fe80-1350-11df-a1f1-0026b9348838";
        // TODO validate EID
        if (value === "Negative") {
          valid = 1;
          resultingValue = "a896d2cc-1350-11df-a1f1-0026b9348838";
        } else if (value === "Positive") {
          valid = 1;
          resultingValue = "a896f3a6-1350-11df-a1f1-0026b9348838";
        }
        // check if data is already synced
        const isDataSynced = await getPatient.checkPatientEIDSync(
          data,
          uuid,
          collection_date
        );
        if (isDataSynced[0].count > 0) {
          alreadySynced++;
          logToFile(
            filename,
            "info",
            `${patientCCCNo}': Record already exists'`
          );
          response = JSON.stringify({
            id: external_id,
            timestamp: now(),
            status: "synced",
          });
        } else {
          let obs: EIDPayloads.Observation = {
            person: uuid,
            concept: conceptID,
            obsDatetime: collection_date,
            value: valid == 1 ? resultingValue : 0,
            order: order,
          };

          eidobs.push(obs);
        }
      } else if (testType === 2) {
        // Viral Load
        conceptID = "a8982474-1350-11df-a1f1-0026b9348838";
        // check if viral load value is valid
        valid = validator.checkStatusOfViralLoad(value);
        if (valid === 2) {
          failed++;
          logToFile(
            filename,
            "error",
            `${patientCCCNo}': Record has erroneous viral load value: ' ${value}`
          );
          response = JSON.stringify({
            id: external_id,
            timestamp: now(),
            status: "failed",
          });
          return response;
        } else if (valid === 3) {
          conceptID = "457c741d-8f71-4829-b59d-594e0a618892";
          resultingValue = "a89c3f1e-1350-11df-a1f1-0026b9348838";
        } else {
          conceptID = "a8982474-1350-11df-a1f1-0026b9348838";
          resultingValue = valid == 1 ? value : 0;
        }
        //  resultingValue = valid == 1 ? value : 0;
        // check if data is already synced
        const isDataSynced = await getPatient.checkPatientVLSync(
          collection_date,
          resultingValue,
          uuid
        );
        if (isDataSynced[0].count > 0) {
          alreadySynced++;
          logToFile(
            filename,
            "info",
            `${patientCCCNo}': Record already exists'`
          );
          response = JSON.stringify({
            id: external_id,
            timestamp: now(),
            status: "synced",
          });
          return response;
        } else {
          let obs: EIDPayloads.Observation = {
            person: uuid,
            concept: conceptID,
            obsDatetime: collection_date,
            value: resultingValue,
            order: order,
          };
          eidobs.push(obs);
        }
      } else if (testType === 3) {
        value_ConceptID = "a89c3d8e-1350-11df-a1f1-0026b9348838"; // - for poor quality sample
        //CD4
        //check if allready  synced
        const isDataSynced = await getPatient.checkPatientCD4Sync(
          data,
          uuid,
          collection_date
        );
        if (isDataSynced[0].count > 0) {
          alreadySynced++;
          logToFile(
            filename,
            "info",
            `${patientCCCNo}': Record already exists'`
          );
          response = JSON.stringify({
            id: external_id,
            timestamp: now(),
            status: "synced",
          });
          return response;
        } else {
          //create payloads
          let absAvgCountValue = data.AVGCD3CD4AbsCnt;
          let isAVGCD3AbsCntEmpty = false;
          let lymphAvgPercValue = data.AVGCD3CD4percentLymph;
          let isAVGCD3CD4percentLymphEmpty = false;
          let cd45AbsCount = data.CD45AbsCnt;
          let isCD45AbsCntEmpty = false;

          //break into two:
          //abscoount
          if (
            absAvgCountValue === "" ||
            absAvgCountValue === null ||
            absAvgCountValue.length === 0
          ) {
            isAVGCD3AbsCntEmpty = true;
          }
          if (
            lymphAvgPercValue === "" ||
            lymphAvgPercValue === null ||
            lymphAvgPercValue.length === 0
          ) {
            isAVGCD3CD4percentLymphEmpty = true;
          }
          if (
            cd45AbsCount === "" ||
            cd45AbsCount === null ||
            cd45AbsCount.length === 0
          ) {
            isCD45AbsCntEmpty = true;
          }

          // check if the value of the response is okay

          if (!isAVGCD3AbsCntEmpty) {
            value = absAvgCountValue;
            conceptID = "a8a8bb18-1350-11df-a1f1-0026b9348838";
            validValue = validator.checkCD4Status(value);
            if (validValue === 3) {
              conceptID = "457c741d-8f71-4829-b59d-594e0a618892";
              value = value_ConceptID;
            }

            let obs_abscount: EIDPayloads.Observation = {
              person: uuid,
              concept: conceptID,
              obsDatetime: collection_date,
              value: value,
              order: order,
            };
            eidobs.push(obs_abscount);
          }
          //%lymph
          if (!isAVGCD3CD4percentLymphEmpty) {
            value = lymphAvgPercValue;
            conceptID = "a8970a26-1350-11df-a1f1-0026b9348838";
            validValue = validator.checkCD4Status(value);
            if (validValue === 3) {
              conceptID = "457c741d-8f71-4829-b59d-594e0a618892";
              value = value_ConceptID;
            }

            let obs_lymph: EIDPayloads.Observation = {
              person: uuid,
              concept: conceptID,
              obsDatetime: collection_date,
              value: value,
              order: order,
            };
            eidobs.push(obs_lymph);
          }
          if (!isCD45AbsCntEmpty) {
            value = cd45AbsCount;
            conceptID = "a898fcd2-1350-11df-a1f1-0026b9348838";
            validValue = validator.checkCD4Status(value);
            if (validValue === 3) {
              conceptID = "457c741d-8f71-4829-b59d-594e0a618892";
              value = value_ConceptID;
            }

            let obs_cd45count: EIDPayloads.Observation = {
              person: uuid,
              concept: conceptID,
              obsDatetime: collection_date,
              value: value,
              order: order,
            };
            eidobs.push(obs_cd45count);
          }
        }
      } else if (testType === 5) {
        // HPV
        conceptID = "a8982474-1350-11df-a1f1-0026b9348838";
        // check if viral load value is valid
        valid = validator.checkHPVStatus(value);
        if (valid === 0) {
          failed++;
          logToFile(
            filename,
            "error",
            `${patientCCCNo}': Record has erroneous HPV value: ' ${value}`
          );
          response = JSON.stringify({
            id: external_id,
            timestamp: now(),
            status: "failed",
          });
          return response;
        } else if (valid === 1) {
          conceptID = "a8a46fd6-1350-11df-a1f1-0026b9348838";
          resultingValue = "a896d2cc-1350-11df-a1f1-0026b9348838";
        } else if (valid === 2) {
          conceptID = "a8a46fd6-1350-11df-a1f1-0026b9348838";
          resultingValue = "a896f3a6-1350-11df-a1f1-0026b9348838";
        } else if (valid === 3) {
          conceptID = "a8a46fd6-1350-11df-a1f1-0026b9348838";
          resultingValue = "a89a7ae4-1350-11df-a1f1-0026b9348838";
        } else {
          conceptID = "a8a46fd6-1350-11df-a1f1-0026b9348838";
          resultingValue = "a89a7ae4-1350-11df-a1f1-0026b9348838";
        }
        //  resultingValue = valid == 1 ? value : 0;
        // check if data is already synced
        const isDataSynced = await getPatient.checkPatientHPVSync(
          collection_date,
          resultingValue,
          uuid
        );
        if (isDataSynced[0].count > 0) {
          alreadySynced++;
          logToFile(
            filename,
            "info",
            `${patientCCCNo}': Record already exists'`
          );
          response = JSON.stringify({
            id: external_id,
            timestamp: now(),
            status: "synced",
          });
          return response;
        } else {
          let obs: EIDPayloads.Observation = {
            person: uuid,
            concept: conceptID,
            obsDatetime: collection_date,
            value: resultingValue,
            order: order,
          };
          eidobs.push(obs);
        }
      }
      for (let i = 0; i < eidobs.length; i++) {
        let eidob = eidobs[i];
        // Perform some action with each observation
        ResultData.push(eidob);
        let httpClient = new config.HTTPInterceptor(
          config.dhp.url || "http://10.50.80.56:5001/eid/csv",
          //  "http://10.50.80.56:5001/staging/eid/csv",
          "",
          "",
          "dhp",
          ""
        );

        await httpClient.axios
          .post("", eidob)
          .then(async (openHIMResp: any) => {
            successfulSync++;
            response = JSON.stringify({
              id: external_id,
              timestamp: now(),
              status: "success",
            });
          })
          .catch(async (err: any) => {
            failed++;
            logToFile(
              filename,
              "error",
              `${patientCCCNo}': Error syncing VL '`
            );
            response = JSON.stringify({
              id: external_id,
              timestamp: now(),
              status: "failed",
            });
          });
      }
    } catch (err) {
      console.log(err);
      response = JSON.stringify({
        id: null,
        timestamp: now(),
        status: "failed",
      });

      return response;
    }
    return response;
  }
}
