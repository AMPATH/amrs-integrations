import { ResponseToolkit } from "@hapi/hapi";
import { ETL_POOL } from "../db";
import { QueueStatus, SP_Params } from "../models/Model";
import { formatDate, getMonthStartDate } from "../utils/DateUtil";
import RdeSyncService from "./rde-sync.service";

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
      return param.h.response("Internal server error \n " + error).code(500);
    }
  }

  async queueAndProcessedPatients(personIds: number[], userId: number, reportingMonth: string): Promise<void> {
    const connection = await ETL_POOL.getConnection();
    try {
      await connection.beginTransaction();
      const replaceQuery = `
        REPLACE INTO etl.hiv_monthly_report_dataset_build_queue
        (SELECT DISTINCT patient_id FROM etl.rde_sync_queue WHERE patient_id IN (${personIds
          .map((_, index) => `?`)
          .join(", ")}))
      `;
      await connection.query(replaceQuery, personIds);
      await connection.commit();

      const startOfReportingMonth = `${formatDate(getMonthStartDate(new Date(reportingMonth)))}`;
      console.log("startDate", startOfReportingMonth);
      //Invoke processing SP
      this.invokeHivMonthlyStoredProcedure(
        {
          queueNumber: userId,
          queueSize: personIds.length,
          log: false,
          cycleSize: 1,
          startDate: startOfReportingMonth,
        },
        personIds
      );
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async invokeHivMonthlyStoredProcedure(
    params: SP_Params,
    patientIds: number[]
  ) {
    const connection = await ETL_POOL.getConnection();
    try {
      const [result] = await connection.execute(
        `CALL generate_hiv_monthly_report_dataset_v1_4('build','${params.queueSize}',${params.queueSize},${params.cycleSize},'${params.startDate}')`
      );
      console.log("Stored procedure execution successful.");

      // update patient queue status to processed
      const rdeSyncService = new RdeSyncService();
      rdeSyncService.updatePatientStatus(patientIds, QueueStatus.PROCESSED);
    } catch (error) {
      console.error(error);
      console.log("Stored procedure execution failed.");
    } finally {
      connection.release();
    }
  }
}

export default MonthlyReportService;
