import Validators from "../helpers/validators";
import path from "path";
import * as fs from "fs";
import csv from "csv-parser";
import GetPatient from "../helpers/dbConnect";
export default class UploadSaveAndArchiveCSV {
  public async uploadFile(file: any, username: string, file_type: string, total_records: number) {
    let validation = new Validators();
    const fileBeingUploaded: any = validation.validateCsv(file);

    if (fileBeingUploaded.error) {
      console.log('err', fileBeingUploaded.error)
      return { error: fileBeingUploaded.error };
    }
    const uploadPath = path.join(
      path.dirname(__dirname),
      `../app/uploads/${username}/${file.hapi.filename}`
    );

    // create a payload to be saved in the database
    let uploadPayload = {
      file_name: file.hapi.filename,
      file_type: file_type,
      path_to_file: uploadPath,
      logged_user: username,
      status: "pending",
      voided: 0,
      total_records: total_records,
    };

    let eidMetaData = new GetPatient();
    // check if the file already exists
    const fileExists = await eidMetaData.checkIfFileExists(uploadPayload);

    if (fileExists.length > 0) {
      return { error: "File name already exists!!" , status: 'error'};
    }

    // check if file path exists
    try {
      // save the payload in the database
      await eidMetaData.postToEidFileUploadMetadata(uploadPayload);
      if (!fs.existsSync(path.dirname(uploadPath))) {
        fs.mkdirSync(path.dirname(uploadPath), {
          recursive: true,
          mode: 0o755,
        });
      }
      // upload the file
      const res = await this.handleFileUpload(file, uploadPath);

      return res;
    } catch (error) {
      console.log("Something went wrong", error);
    }
    return { error: "Failed to upload file", status: 'error' };
  }

  handleFileUpload = async (file: any, uploadPath: string) => {
    // const options = { headers: true, quoteColumns: true };
    const stream = fs.createWriteStream(uploadPath);
    file.pipe(stream);

    return new Promise((resolve, reject) => {
      stream
        .on("error", (err) => console.error(err))
        .on("finish", () => resolve({ message: "Upload successfully!" , status: 'success'}));
    });
  };
}
