import config from "@amrs-integrations/core";
let CM = config.ConnectionManager.getInstance();

export default class GetPatient {
  async getPatientUUIDUsingIdentifier(params: string, isCCC: boolean) {
    let extraParams = "";
    if (isCCC) {
      extraParams = `and pi.identifier_type=28`;
    }
    let amrsCON = await CM.getConnectionAmrs();
    let sql = `select p.uuid from amrs.patient_identifier pi left join amrs.person p on p.person_id=pi.patient_id where pi.identifier='${params}' and pi.voided=0 ${extraParams}`;
    let result: any = await CM.query(sql, amrsCON);
    await CM.releaseConnections(amrsCON);
    return result;
  }

  async getPatientOrderNumber(params: string) {
    let amrsCON = await CM.getConnectionAmrs();
    let sql = `select order_id,encounter_id from amrs.orders where order_number='${params}' and voided=0`;
    let result: any = await CM.query(sql, amrsCON);
    await CM.releaseConnections(amrsCON);
    return result;
  }
  async checkPatientVLSync(params: any, uuid: string) {
    let amrsCON = await CM.getConnectionAmrs();
    let sql = `select count(encounter_id)  as count from etl.flat_labs_and_imaging where test_datetime='${params.collection_date}' and uuid='${uuid}' and hiv_viral_load = '${params.value}'`;
    let result: any = await CM.query(sql, amrsCON);
    await CM.releaseConnections(amrsCON);
    return result;
  }

  async checkPatientCD4Sync(params: any, uuid: string) {
    let amrsCON = await CM.getConnectionAmrs();
    let sql = `select count(encounter_id)  as count from etl.flat_labs_and_imaging where test_datetime='${params.collection_date}' and uuid='${uuid}' and cd4_count = '${params.value}'`;
    let result: any = await CM.query(sql, amrsCON);
    await CM.releaseConnections(amrsCON);
    return result;
  }

  // POST TO etl.eid_file_upload_metadata
  async postToEidFileUploadMetadata(params: any) {
    let amrsCON = await CM.getConnectionAmrs();
    let sql = `insert into etl.eid_file_upload_metadata (file_name, file_type, path_to_file, logged_user, status, voided, total_records) values('${params.file_name}', '${params.file_type}', '${params.path_to_file}', '${params.logged_user}','${params.status}', '${params.voided}', '${params.total_records}')`;
    let result: any = await CM.query(sql, amrsCON);
    await CM.releaseConnections(amrsCON);
    return result;
  }
  // Check if file already exists
  async checkIfFileExists(params: any) {
    let amrsCON = await CM.getConnectionAmrs();
    let sql = `select * from etl.eid_file_upload_metadata where file_name='${params.file_name}'`;
    let result: any = await CM.query(sql, amrsCON);
    await CM.releaseConnections(amrsCON);
    return result;
  }
  // get file id
  async getEidCsvMetaData(pageNumber: number, pageSize: number) {
    const offset = (pageNumber - 1) * pageSize;
    let amrsCON = await CM.getConnectionAmrs();
    let sql = `select * from etl.eid_file_upload_metadata where voided=0 limit ${pageSize} offset ${offset}`;
    let result = await CM.query(sql, amrsCON);
    await CM.releaseConnections(amrsCON);
    return result;
}

// voided 1 on delete
async voidEidCsvMetaData(params: any) {
  let amrsCON = await CM.getConnectionAmrs();
  let sql = `update etl.eid_file_upload_metadata set voided=1 where eid_file_upload_metadata_id='${params}'`;
  let result = await CM.query(sql, amrsCON);
  await CM.releaseConnections(amrsCON);
  return result;
}

// update status and successful records
async updateEidCsvMetaData(params: any) {
  let amrsCON = await CM.getConnectionAmrs();
  let sql = `update etl.eid_file_upload_metadata set status='${params.status}', successful='${params.successful}' where eid_file_upload_metadata_id='${params.eid_file_upload_metadata_id}'`;
  let result = await CM.query(sql, amrsCON);
  await CM.releaseConnections(amrsCON);
  return result;
}

// update existing data
async updateExistingData(params: any) {
  let amrsCON = await CM.getConnectionAmrs();
  let sql = `update etl.eid_file_upload_metadata set existing_records='${params.existing_records}' where eid_file_upload_metadata_id='${params.eid_file_upload_metadata_id}'`;
  let result = await CM.query(sql, amrsCON);
  await CM.releaseConnections(amrsCON);
  return result;
}
}
