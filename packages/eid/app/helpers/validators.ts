import _ from "lodash";

// import * as fast_csv from "fast-csv";
import * as fs from "fs";
import * as Papa from "papaparse";
import Helpers from "./helperFunctions";
export default class Validators {
  checkStatusOfViralLoad(viralLoadPayload: string) {
    let status = 0;
    const hasNumbersOnly = /^[0-9]*(?:\.\d{1,2})?$/;
    const hasLessThanSymbol = /</g;
    const helper = new Helpers();

    if (_.isEmpty(viralLoadPayload)) return -1;
    var viralLoadResult = helper.removeWhiteSpace(viralLoadPayload);

    if (_.isEmpty(viralLoadResult)) {
      return -1;
    }

    if (hasNumbersOnly.test(viralLoadResult)) {
      status = 1;
    } else if (
      hasLessThanSymbol.test(viralLoadResult) ||
      viralLoadPayload.trim() === "Target Not Detected"
    ) {
      status = 0;
    } else {
      status = 2;
    }
    return status;
  }

  validateCsv(file: any) {
    try {
      // Check that file is a CSV
      if (file.hapi.headers["content-type"] !== "text/csv") {
        return { error: "Invalid file type. Only CSV files are allowed", status: 'error' };
      }

      // Check if file size is greater than zero
    if (file._data.length <= 0) {
      return {error: "Failed. Uploaded file is empty.", status: 'error'};
    }

      return true;

    } catch (error) {
      console.error(error);
      return { error: "An error occurred while validating the CSV file", status: 'error' };
    }
  }
  // check if all the required columns are present
  validateColumns(filePath: fs.PathLike, expectedColumns: any) {
    const file = fs.readFileSync(filePath, "utf-8");

    return new Promise<void>((resolve, reject) => {
      const headers = Papa.parse(file, {
        header: true,
      }).meta.fields;

      let missingColumns = _.difference(expectedColumns, headers || []);
      if (missingColumns.length > 0) {
        reject(
          `The following columns are missing: ${missingColumns.join(", ")}`
        );
      } else {
        resolve();
      }

      // .on('error', reject);
    });
  }
  // identify type of identifier passed
  checkIdentifierIsCCC(identifierNumber: any) {
    let isValid: boolean = false;
    let numberToCheck: any = identifierNumber;
    // remove spaces and special characters
    numberToCheck = numberToCheck.replace(/[^a-zA-Z0-9]/g, "");
    // check if all are numbers
    if (isNaN(numberToCheck)) {
      isValid = false;
    }
    // check if they are 10 digits
    else if (numberToCheck.length != 10) {
      isValid = false;
    }
    // check position of the hyphen
    else if (identifierNumber.indexOf("-") != 5) {
      isValid = false;
    } else {
      isValid = true;
    }
    return isValid;
  }
}
