import Validators from "../helpers/validators";
import path from "path";
import * as fs from "fs";
import csv from "csv-parser";
import cron from 'node-cron';
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
      const res = await this.handleFileUpload(file, uploadPath, username);

      return res;
    } catch (error) {
      console.log("Something went wrong", error);
    }
    return { error: "Failed to upload file", status: 'error' };
  }

  handleFileUpload = async (file: any, uploadPath: string, username:string) => {
    // const options = { headers: true, quoteColumns: true };
    const stream = fs.createWriteStream(uploadPath);
    file.pipe(stream);

    return new Promise((resolve, reject) => {
      stream
        .on("error", (err) => console.error(err))
        .on("finish", () => resolve((this.updateUploadLogs(file.hapi.filename,username),{ message: "Upload successfully!" , status: 'success'})));
    });
  };
  //log file for new csv files in the upload subfolders
  updateUploadLogs = async (file:any,username:string)=>{
    const logFilePath = path.join(
      path.dirname(__dirname),
      `../app/uploads/${username}/logs.txt`
    );
    fs.readFile(logFilePath, "utf-8", function(err, data) {
      if (err) {
        if (err.code === 'ENOENT') {
          // Log file does not exist, create new array
          data = '[]';
        } else {
          throw err;
        }
      }
      const logs = JSON.parse(data);
      const fileLog = {
        file_name: file,
        logged_user: username,
        uploadTime: new Date().toISOString()
      };
      logs.push(fileLog);
      fs.writeFile(logFilePath, JSON.stringify(logs), (err) => {
        if (err) throw err;
        return fileLog
      });  
    });
  }
//Archive csv uploads when server starts & weekly if server is up
handleArchive = async()=>{
  const uploadsPath = path.join(path.dirname(__dirname), '../app/uploads/');
  const uploadSubFolders = await Promise.all(await this.getUploadSubFolders(uploadsPath));
  this.checkCsvUploadTime(uploadSubFolders)
  const archive = cron.schedule('0 0 */7 * *', async () => {
    this.checkCsvUploadTime(uploadSubFolders);
  });
  archive.start();
}
//check the upload time of a csv in the logs file.
checkCsvUploadTime = async (uploadSubFolders: any) => {
  for (const subFolder of uploadSubFolders) {
    const logs = path.join(subFolder, `logs.txt`);
      const logPath = fs.statSync(logs);
      if (logPath.isFile()) {
        const data = fs.readFileSync(logs, `utf-8`);
        const fileLogs = JSON.parse(data);
        for (const log of fileLogs) {
          const now = new Date();
          const csvPath = path.join(subFolder, `${log.file_name}`);
          const uploadTime = new Date(log.uploadTime);
          const one_week_in_ms = 604800000;
          const timeDifference = now.getTime() - uploadTime.getTime();
          // if upload time > 1 week && file exists, delete from folder.
          if (fs.existsSync(csvPath) && fs.statSync(csvPath).isFile() && timeDifference > one_week_in_ms) {
           this.deleteCsvFile(csvPath);
          } 
        }
      }
  }
};
//delete csv file from upload subfolders
deleteCsvFile = async(csvPath:string)  =>{
return new Promise<void>((resolve, reject) => {
  fs.unlink(csvPath, async (err) => {
    if (err) {
      reject();
    } else {
      let csvFile = csvPath.split("/").pop();
      await this.voidUploads(csvFile)
      resolve();
    }
  });
});
}
voidUploads = async(csvFile:any)=>{
  let uploadPayload = {
    file_name: csvFile,
  }
  try{
    const query = new GetPatient();
    // if csv metadata is in etl, void record
    let fileExists = await query.checkIfFileExists(uploadPayload);
    if(fileExists.length>0){
      let csvfileId = fileExists[0].eid_file_upload_metadata_id; 
      await query.voidEidCsvMetaData(csvfileId)
    }
  }catch(e:any){
    return e;
  }
}
// get path to existing subfolders in uploads
getUploadSubFolders = async(dir:string)=>{
  const subFolders = fs.readdirSync(dir);
  return subFolders.filter(subFolders => {
    const filePath = path.join(dir, subFolders);
    const stat = fs.statSync(filePath);
    return stat.isDirectory();
  }).map(subFolders=>path.join(dir,subFolders))
}}
new UploadSaveAndArchiveCSV().handleArchive();
