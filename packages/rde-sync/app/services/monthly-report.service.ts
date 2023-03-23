import { ResponseToolkit } from "@hapi/hapi";
import { ETL_POOL } from "../db";

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
      const connection = await ETL_POOL.getConnection();

      const [rows] = await connection.query(query, [
        param.user_id,
        param.reporting_month,
      ]);
      connection.release();
      return rows;
    } catch (error) {
      console.error(error);
      return param.h.response("Internal server error \n " +error).code(500);
    }
  }

  async queuePatients(personIds: number[]): Promise<void> {
    const connection = await ETL_POOL.getConnection();
    try {
      await connection.beginTransaction();
      const replaceQuery = `
        REPLACE INTO etl.hiv_monthly_report_dataset_build_queue
        (SELECT DISTINCT patient_id FROM etl.rde_sync_queue WHERE patient_id IN (${personIds.map((_, index) => `?`).join(', ')}))
      `;
      await connection.query(replaceQuery, personIds);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

export default MonthlyReportService;
