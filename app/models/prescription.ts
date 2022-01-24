import mysql, { Connection } from "mysql";

import ConnectionManager from "../loaders/mysql";
import AMRSConnectionManager from "../loaders/mysql-amrs";
import PrescriptionService from "../services/prescription";
const prescriptionService = new PrescriptionService();
const CM = ConnectionManager.getInstance();
const table = "etl.adt_drug_orders";
export async function savePrescription(
  prescription: IADTDispense.ADTDispense,
  connection: Connection
) {
  if (prescription != null) {
    prescriptionService.updateAMRSOrder(prescription, "COMPLETED");
    for (let i = 0; i < prescription.drug_details.length; i++) {
      const sql = mysql.format(
        `INSERT INTO ${table} Values (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          "",
          prescription.mflcode,
          prescription.order_details.transaction_datetime,
          prescription.order_details.order_number,
          prescription.drug_details[i].prescription_number,
          prescription.drug_details[i].drug_name,
          prescription.drug_details[i].strength,
          prescription.drug_details[i].dosage,
          prescription.drug_details[i].units,
          prescription.drug_details[i].frequency,
          prescription.drug_details[i].duration,
          prescription.drug_details[i].prescription_notes,
        ]
      );
      let result: Patient.Patient = await CM.query(sql, connection);
      console.log(result);
    }
  }
  CM.releaseConnections(connection);
}

export async function updateAmrsOrderStatus(adtResp: any, status: string) {
  const AmrsCon = AMRSConnectionManager.getInstance();
  let connection = await AmrsCon.getConnectionAmrs();
  AmrsCon.releaseConnections(connection);
  connection = await AmrsCon.getConnectionAmrs();
  let sql = "";
  adtResp.drug_details.forEach((order: any) => {
    sql = `update amrs.orders set fulfiller_status = '${status}' where order_number = '${order.prescription_number}'`;
  });
  let result = await AmrsCon.query(sql, connection);
  if (result.affectedRows > 0) {
    console.log("Amrs order status updated successfully");
  }
  AmrsCon.releaseConnections(connection);
}
