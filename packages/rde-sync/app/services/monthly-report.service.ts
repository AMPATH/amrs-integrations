import { ResponseToolkit } from "@hapi/hapi";
import pool from "../db";

interface MonthlyReportQueryParams {
  user_id: number;
  reporting_month: string;
  h: ResponseToolkit;
}

class MonthlyReportService {
  async getHivMonthlyReportFrozen(param: MonthlyReportQueryParams) {
    let query = `select hmf.date_created,
        person_id,
        person_uuid,
        birthdate,
        age,
        gender,
        location_id,
        clinic,
        rtc_date,
        prev_status,
        hmf.status,
        next_status,
        endDate as reporting_month,
        rs.status as queue_status
 from etl.hiv_monthly_report_dataset_frozen hmf
 left join etl.rde_sync_queue rs on hmf.person_id = rs.patient_id
 where rs.user_id = ? and hmf.endDate = ?`;
    try {
      const connection = await pool.getConnection();

      const [rows] = await connection.query(query, [
        param.user_id,
        param.reporting_month,
      ]);
      connection.release();
      return rows;
    } catch (error) {
      console.error(error);
      return param.h.response("Internal server error" + error).code(500);
    }
  }
}

export default MonthlyReportService;
